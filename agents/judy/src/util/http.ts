// Cliente HTTP "educado": se identifica, respeta robots.txt, espacia peticiones por dominio,
// reintenta con espera exponencial ante 429/5xx y nunca reintenta errores 4xx definitivos.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpClient = {
  getText(url: string, init?: RequestInit): Promise<string>;
  getJson<T>(url: string, init?: RequestInit): Promise<T>;
  postForm<T>(url: string, form: FormData): Promise<T>;
  stats: { requests: number; retries: number; blockedByRobots: number };
};

export type HttpOptions = {
  fetch?: FetchLike;
  userAgent?: string;
  /** Milisegundos mínimos entre dos peticiones al mismo dominio. */
  minIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Dominios de APIs públicas documentadas donde robots.txt no aplica (no son páginas web). */
  robotsExempt?: string[];
  sleep?: (ms: number) => Promise<void>;
};

export const DEFAULT_USER_AGENT = "NexoLab-Judy/0.1 (+https://github.com/nik-ilin/Hackathon-AImpacto; recopilación de convocatorias de investigación)";

export class HttpError extends Error {
  status: number;
  url: string;
  constructor(status: number, url: string, message: string) {
    super(message);
    this.status = status;
    this.url = url;
  }
}

export function createHttpClient(options: HttpOptions = {}): HttpClient {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const minInterval = options.minIntervalMs ?? 400;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRetries = options.maxRetries ?? 3;
  const exempt = new Set(options.robotsExempt ?? []);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const lastRequestAt = new Map<string, number>();
  const robotsCache = new Map<string, RobotsRules>();
  const stats = { requests: 0, retries: 0, blockedByRobots: 0 };

  async function throttle(host: string) {
    const wait = (lastRequestAt.get(host) ?? 0) + minInterval - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());
  }

  async function allowedByRobots(url: URL): Promise<boolean> {
    if (exempt.has(url.hostname)) return true;
    let rules = robotsCache.get(url.origin);
    if (!rules) {
      rules = { allow: [], disallow: [] };
      try {
        await throttle(url.hostname);
        stats.requests++;
        const response = await doFetch(`${url.origin}/robots.txt`, {
          headers: { "user-agent": userAgent },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const type = response.headers.get("content-type") ?? "";
        // Algunos sitios devuelven su portada HTML en /robots.txt: se trata como "sin reglas".
        if (response.ok && !type.includes("html")) rules = parseRobots(await response.text());
      } catch {
        // Sin robots.txt accesible se aplica la política por defecto (permitido), como hacen los rastreadores.
      }
      robotsCache.set(url.origin, rules);
    }
    return isAllowed(rules, url.pathname + url.search);
  }

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const parsed = new URL(url);
    if (!(await allowedByRobots(parsed))) {
      stats.blockedByRobots++;
      throw new HttpError(0, url, `robots.txt no permite acceder a ${url}`);
    }
    for (let attempt = 0; ; attempt++) {
      await throttle(parsed.hostname);
      stats.requests++;
      let response: Response;
      try {
        response = await doFetch(url, {
          ...init,
          headers: { "user-agent": userAgent, "accept-language": "es-ES,es;q=0.9,en;q=0.8", ...(init.headers as Record<string, string> | undefined) },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (attempt >= maxRetries) throw new HttpError(0, url, `Fallo de red en ${url}: ${String(error)}`);
        stats.retries++;
        await sleep(backoff(attempt));
        continue;
      }
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        throw new HttpError(response.status, url, `HTTP ${response.status} en ${url}`);
      }
      stats.retries++;
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : backoff(attempt));
    }
  }

  return {
    stats,
    async getText(url, init) {
      return (await request(url, init)).text();
    },
    async getJson<T>(url: string, init?: RequestInit) {
      const response = await request(url, { ...init, headers: { accept: "application/json", ...(init?.headers as Record<string, string> | undefined) } });
      return (await response.json()) as T;
    },
    async postForm<T>(url: string, form: FormData) {
      const response = await request(url, { method: "POST", body: form, headers: { accept: "application/json" } });
      return (await response.json()) as T;
    },
  };
}

function backoff(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

type RobotsRules = { allow: string[]; disallow: string[] };

/** Reglas del grupo "User-agent: *" (Judy no tiene grupo propio en ningún sitio). */
export function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { allow: [], disallow: [] };
  let inStarGroup = false;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const key = field.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      inStarGroup = lastWasAgent ? inStarGroup || value === "*" : value === "*";
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!inStarGroup) continue;
    if (key === "disallow" && value) rules.disallow.push(value);
    if (key === "allow" && value) rules.allow.push(value);
  }
  return rules;
}

/** Gana la regla más específica (más larga); en empate, Allow. */
export function isAllowed(rules: RobotsRules, path: string): boolean {
  const matchLength = (pattern: string) => {
    const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);
    return regex.test(path) ? pattern.length : -1;
  };
  const allow = Math.max(-1, ...rules.allow.map(matchLength));
  const disallow = Math.max(-1, ...rules.disallow.map(matchLength));
  return disallow < 0 || allow >= disallow;
}
