import { describe, expect, it, vi } from "vitest";
import { parseOrcidId } from "../../src/features/profiles/import/orcid-id";
import { normalizeOrcidRecord } from "../../src/features/profiles/import/orcid";
import {
  handleProfileOrcidRequest,
  OrcidTokenCache,
} from "../../supabase/functions/profile-orcid/handler";

const id = "0000-0002-1694-233X";
const fixture = {
  person: {
    name: {
      "given-names": { value: "Ana" },
      "family-name": { value: "García" },
      visibility: "PUBLIC",
    },
    biography: { content: "Investiga materiales.", visibility: "PUBLIC" },
    addresses: {
      address: [{ country: { value: "ES" }, visibility: "PUBLIC" }],
    },
    keywords: { keyword: [{ content: "Física", visibility: "PUBLIC" }] },
  },
  "activities-summary": {
    employments: {
      "employment-summary": [
        {
          organization: { name: "Universidad A" },
          "role-title": "Investigadora",
          "end-date": null,
          visibility: "PUBLIC",
        },
      ],
    },
    educations: {
      "education-summary": [
        {
          organization: { name: "Universidad B" },
          "role-title": "Doctorado",
          visibility: "PUBLIC",
        },
      ],
    },
    works: {
      group: [
        {
          "work-summary": [
            {
              title: { title: { value: "Artículo real" } },
              visibility: "PUBLIC",
            },
          ],
        },
      ],
    },
  },
};

describe("ORCID iD", () => {
  it("acepta iD y URL con checksum ISO 7064, incluido X", () => {
    expect(parseOrcidId(id)).toBe(id);
    expect(parseOrcidId(`https://orcid.org/${id.toLowerCase()}`)).toBe(id);
    expect(parseOrcidId("0000-0002-1825-0097")).toBe("0000-0002-1825-0097");
  });
  it("rechaza checksum inválido, dominio falso y sufijos inesperados", () => {
    expect(() => parseOrcidId("0000-0002-1694-2330")).toThrow(
      "dígito de control",
    );
    expect(() => parseOrcidId(`https://orcid.org.evil/${id}`)).toThrow();
    expect(() => parseOrcidId(`https://orcid.org/${id}/anything`)).toThrow();
    expect(() => parseOrcidId("0000-0000-0000-000X")).toThrow();
  });
});

describe("normalización ORCID público", () => {
  it("extrae solo campos compatibles y muestra trabajos, formación y publicaciones como contexto", () => {
    const result = normalizeOrcidRecord(fixture, id);
    expect(result.fields).toEqual({
      orcid_id: id,
      full_name: "Ana García",
      bio: "Investiga materiales.",
      country: "ES",
      institution: "Universidad A",
    });
    expect(result.topicHints).toEqual(["Física"]);
    expect(result.context).toEqual([
      "Empleo: Investigadora · Universidad A",
      "Formación: Doctorado · Universidad B",
      "Publicación: Artículo real",
    ]);
    expect(result.fields.skills).toBeUndefined();
  });
  it("tolera registros parciales sin inventar nombre, país o publicaciones", () => {
    expect(
      normalizeOrcidRecord({ person: {}, "activities-summary": {} }, id),
    ).toEqual({
      source: "ORCID",
      fields: { orcid_id: id },
      context: [],
      topicHints: [],
    });
  });
  it("descarta elementos no públicos y no elige institución entre varias actuales", () => {
    const result = normalizeOrcidRecord(
      {
        person: {
          name: { ...fixture.person.name, visibility: "PRIVATE" },
          biography: { content: "Secreto", visibility: "LIMITED" },
          keywords: {
            keyword: [{ content: "Secreto", visibility: "PRIVATE" }],
          },
        },
        "activities-summary": {
          employments: {
            "employment-summary": [
              { organization: { name: "A" }, visibility: "PUBLIC" },
              { organization: { name: "B" }, visibility: "PUBLIC" },
            ],
          },
        },
      },
      id,
    );
    expect(result.fields).toEqual({ orcid_id: id });
    expect(result.topicHints).toEqual([]);
  });
  it("rechaza una respuesta sin estructura de registro", () => {
    expect(() => normalizeOrcidRecord(null, id)).toThrow("formato de registro");
  });
  it("rechaza un registro ORCID cuyo identificador no coincide con el solicitado", () => {
    expect(() =>
      normalizeOrcidRecord(
        {
          "orcid-identifier": { path: "0000-0002-1825-0097" },
        },
        id,
      ),
    ).toThrow("otra persona");
  });
});

const request = (orcidId = id, authorization = "Bearer user-jwt") =>
  new Request("http://localhost/functions/v1/profile-orcid", {
    method: "POST",
    headers: { authorization },
    body: JSON.stringify({ orcidId }),
  });
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
const deps = () => ({
  clientId: "server-client",
  clientSecret: "server-secret",
  validateUser: vi.fn(async () => true),
  fetch: vi.fn<typeof fetch>(),
});

describe("función ORCID autenticada", () => {
  it("reutiliza el token de aplicación y renueva antes de caducar", async () => {
    let now = 0;
    const dependencies = {
      ...deps(),
      tokenCache: new OrcidTokenCache(() => now),
    };
    dependencies.fetch.mockImplementation(async (url) =>
      json(
        String(url).endsWith("/oauth/token")
          ? { access_token: "cached", expires_in: 120 }
          : fixture,
      ),
    );
    expect(
      (await handleProfileOrcidRequest(request(), dependencies)).status,
    ).toBe(200);
    now = 89_000;
    expect(
      (await handleProfileOrcidRequest(request(), dependencies)).status,
    ).toBe(200);
    expect(
      dependencies.fetch.mock.calls.filter(([url]) =>
        String(url).endsWith("/oauth/token"),
      ),
    ).toHaveLength(1);
    now = 90_000;
    expect(
      (await handleProfileOrcidRequest(request(), dependencies)).status,
    ).toBe(200);
    expect(
      dependencies.fetch.mock.calls.filter(([url]) =>
        String(url).endsWith("/oauth/token"),
      ),
    ).toHaveLength(2);
  });
  it("comparte concesiones concurrentes, recupera errores e invalida tokens rechazados", async () => {
    const cache = new OrcidTokenCache(() => 0);
    let release!: (value: { value: string; expiresIn: number }) => void;
    const load = vi.fn(
      () =>
        new Promise<{ value: string; expiresIn: number }>((resolve) => {
          release = resolve;
        }),
    );
    const a = cache.get(load);
    const b = cache.get(load);
    release({ value: "one", expiresIn: 3600 });
    expect(await Promise.all([a, b])).toEqual(["one", "one"]);
    expect(load).toHaveBeenCalledTimes(1);
    const dependencies = { ...deps(), tokenCache: cache };
    dependencies.fetch.mockResolvedValueOnce(json({}, 401));
    expect(
      (await handleProfileOrcidRequest(request(), dependencies)).status,
    ).toBe(502);
    dependencies.fetch.mockResolvedValueOnce(json({}, 503));
    expect(
      (await handleProfileOrcidRequest(request(), dependencies)).status,
    ).toBe(502);
    dependencies.fetch
      .mockResolvedValueOnce(json({ access_token: "two", expires_in: 3600 }))
      .mockResolvedValueOnce(json(fixture));
    expect(
      (await handleProfileOrcidRequest(request(), dependencies)).status,
    ).toBe(200);
    expect(
      dependencies.fetch.mock.calls.filter(([url]) =>
        String(url).endsWith("/oauth/token"),
      ),
    ).toHaveLength(2);
  });
  it("rechaza ausencia de sesión y de configuración sin consultar ORCID", async () => {
    const dependencies = deps();
    const unauthorized = await handleProfileOrcidRequest(
      request(id, ""),
      dependencies,
    );
    expect(unauthorized.status).toBe(401);
    expect(dependencies.fetch).not.toHaveBeenCalled();
    const unconfigured = await handleProfileOrcidRequest(request(), {
      ...dependencies,
      clientSecret: undefined,
    });
    expect(unconfigured.status).toBe(503);
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });
  it("rechaza identificadores inválidos antes de llamar al proveedor", async () => {
    const dependencies = deps();
    const response = await handleProfileOrcidRequest(
      request("0000-0000-0000-0000"),
      dependencies,
    );
    expect(response.status).toBe(400);
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });
  it("usa /read-public y endpoints oficiales en servidor", async () => {
    const dependencies = deps();
    dependencies.fetch
      .mockResolvedValueOnce(json({ access_token: "secret-token" }))
      .mockResolvedValueOnce(json(fixture));
    const response = await handleProfileOrcidRequest(request(), dependencies);
    expect(response.status).toBe(200);
    expect((await response.json()).fields.full_name).toBe("Ana García");
    expect(dependencies.fetch).toHaveBeenCalledTimes(2);
    expect(dependencies.fetch.mock.calls[0][0]).toBe(
      "https://orcid.org/oauth/token",
    );
    const tokenInit = dependencies.fetch.mock.calls[0][1];
    expect(String(tokenInit?.body)).toContain("scope=%2Fread-public");
    expect(dependencies.fetch.mock.calls[1][0]).toBe(
      `https://pub.orcid.org/v3.0/${id}/record`,
    );
    expect(dependencies.fetch.mock.calls[1][1]?.headers).toEqual({
      Authorization: "Bearer secret-token",
      Accept: "application/vnd.orcid+json",
    });
  });
  it.each([
    [404, 404],
    [429, 429],
    [403, 502],
    [500, 502],
  ])("traduce error HTTP ORCID %i a %i", async (status, expected) => {
    const dependencies = deps();
    dependencies.fetch
      .mockResolvedValueOnce(json({ access_token: "token" }))
      .mockResolvedValueOnce(json({}, status));
    expect(
      (await handleProfileOrcidRequest(request(), dependencies)).status,
    ).toBe(expected);
  });
  it("distingue credenciales sin permiso, límites y fallos de red", async () => {
    for (const [status, expected] of [
      [403, 503],
      [429, 429],
    ] as const) {
      const dependencies = deps();
      dependencies.fetch.mockResolvedValueOnce(json({}, status));
      expect(
        (await handleProfileOrcidRequest(request(), dependencies)).status,
      ).toBe(expected);
    }
    const offline = deps();
    offline.fetch.mockRejectedValueOnce(
      new TypeError("network failure secret-token"),
    );
    const response = await handleProfileOrcidRequest(request(), offline);
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("secret-token");
  });
  it("limita respuestas excesivas y oculta tokens de los errores", async () => {
    const dependencies = deps();
    dependencies.fetch
      .mockResolvedValueOnce(json({ access_token: "token" }))
      .mockResolvedValueOnce(json({ big: "a".repeat(2_000_001) }));
    const response = await handleProfileOrcidRequest(request(), dependencies);
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("token");
  });
});
