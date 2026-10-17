import { describe, expect, it } from "vitest";
import { computeStatus, findSpanishDate, parseDate, stripHtml, asHttpsUrl } from "../src/util/text.ts";
import { createHttpClient, isAllowed, parseRobots } from "../src/util/http.ts";
import { keyMatches } from "../src/server.ts";

describe("Fechas (plazos en hora de Madrid)", () => {
  it("interpreta los formatos de BDNS, de la UE y de las webs en castellano", () => {
    expect(parseDate("2026-11-03")).toBe("2026-11-03T22:59:59.000Z"); // invierno: UTC+1
    expect(parseDate("2026-07-10")).toBe("2026-07-10T21:59:59.000Z"); // verano: UTC+2
    expect(parseDate("2026-12-01T00:00:00.000+0000")).toBe("2026-12-01T00:00:00.000Z");
    expect(parseDate("15/11/2026")).toBe("2026-11-15T22:59:59.000Z");
    expect(findSpanishDate("Plazo: hasta el 15 de octubre de 2026 a las 15:00h")).toBe("2026-10-15T21:59:59.000Z");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("Sin plazo de solicitud")).toBeNull();
  });

  it("calcula el estado a partir de las fechas", () => {
    const now = new Date("2026-10-17T10:00:00Z");
    expect(computeStatus("2026-09-01T00:00:00Z", "2026-11-01T00:00:00Z", now)).toBe("open");
    expect(computeStatus("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z", now)).toBe("forthcoming");
    expect(computeStatus(null, "2026-10-01T00:00:00Z", now)).toBe("closed");
    expect(computeStatus(null, null, now)).toBe("unknown");
  });

  it("limpia HTML y normaliza enlaces", () => {
    expect(stripHtml("<p>Hola&nbsp;<strong>mundo</strong></p><ul><li>uno</li></ul>")).toBe("Hola mundo\nuno");
    expect(asHttpsUrl("www.navarra.es")).toBe("https://www.navarra.es/");
    expect(asHttpsUrl("no es url")).toBeNull();
  });
});

describe("Cliente HTTP educado", () => {
  it("lee el grupo User-agent: * de robots.txt y aplica la regla más específica", () => {
    const rules = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /privado/\nAllow: /privado/publico\n");
    expect(isAllowed(rules, "/convocatorias")).toBe(true);
    expect(isAllowed(rules, "/privado/datos")).toBe(false);
    expect(isAllowed(rules, "/privado/publico/x")).toBe(true);
  });

  it("respeta robots.txt, reintenta 503 y no reintenta 404", async () => {
    const calls: string[] = [];
    let attempts = 0;
    const http = createHttpClient({
      minIntervalMs: 0,
      sleep: async () => {},
      fetch: async (url) => {
        calls.push(url);
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /bloqueado", { headers: { "content-type": "text/plain" } });
        if (url.includes("/inestable")) return ++attempts < 3 ? new Response("", { status: 503 }) : new Response("ok");
        if (url.includes("/no-existe")) return new Response("", { status: 404 });
        return new Response("ok");
      },
    });
    await expect(http.getText("https://ejemplo.org/bloqueado/x")).rejects.toThrow("robots.txt");
    expect(await http.getText("https://ejemplo.org/inestable")).toBe("ok");
    await expect(http.getText("https://ejemplo.org/no-existe")).rejects.toThrow("HTTP 404");
    expect(calls.filter((c) => c.includes("/no-existe"))).toHaveLength(1);
    expect(calls.filter((c) => c.endsWith("/robots.txt"))).toHaveLength(1); // robots en caché
    expect(http.stats.blockedByRobots).toBe(1);
  });

  it("un robots.txt que devuelve la portada HTML se trata como sin reglas", async () => {
    const http = createHttpClient({ minIntervalMs: 0, sleep: async () => {}, fetch: async (url) =>
      url.endsWith("/robots.txt") ? new Response("<html>Disallow: /</html>", { headers: { "content-type": "text/html" } }) : new Response("ok") });
    expect(await http.getText("https://ucm.example/otri")).toBe("ok");
  });
});

describe("Servidor", () => {
  it("compara la clave en tiempo constante", () => {
    expect(keyMatches("abc", "abc")).toBe(true);
    expect(keyMatches("abc", "abd")).toBe(false);
    expect(keyMatches(undefined, "abc")).toBe(false);
    expect(keyMatches("abc", undefined)).toBe(false);
  });
});
