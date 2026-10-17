import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localConfig } from "./local-config.mjs";

const { url, key } = localConfig();
const run = randomUUID();
const newClient = () =>
  createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
const check = async (operation) => {
  const { data, error } = await operation;
  if (error) throw new Error(`Operación local fallida: ${error.message}`);
  return data;
};
const users = [];
for (const label of ["a", "b", "c"]) {
  const client = newClient();
  const auth = await check(
    client.auth.signUp({
      email: `${label}-${run}@example.test`,
      password: `Local-${randomUUID()}-9!`,
    }),
  );
  assert.ok(
    auth.session,
    "El stack local de test debe desactivar confirmación de email; remoto conserva confirmación.",
  );
  users.push({ client, id: auth.user.id });
}
const [a, b, c] = users;
const topic = (
  await check(
    a.client.from("topics").select("id").eq("slug", "physics").single(),
  )
).id;
for (const [index, user] of users.entries()) {
  await check(
    user.client.rpc("upsert_profile", {
      p_full_name: `Persona ${index} de prueba`,
      p_username: null,
      p_institution: null,
      p_country: null,
      p_academic_stage: "student",
      p_bio: null,
      p_skills: ["Análisis"],
      p_orcid_id: null,
      p_visibility: "private",
      p_topic_ids: [topic],
    }),
  );
}
const groupId = await check(
  a.client.rpc("save_research_group", {
    p_group_id: null,
    p_name: `Grupo local ${run}`,
    p_description: "Integración reproducible M1",
    p_institution: "Institución de prueba",
    p_country: "España",
    p_visibility: "public",
    p_accepting_members: true,
    p_topic_ids: [topic],
  }),
);
const found = await check(
  b.client.rpc("discover_groups", {
    p_search: run,
    p_topic_id: topic,
    p_accepting: true,
    p_limit: 20,
    p_offset: 0,
  }),
);
assert.equal(found.length, 1, "N: búsqueda por disciplina y nombre");
assert.equal(found[0].id, groupId);
assert.ok(
  Number(found[0].match_count) >= 1,
  "Recomendación explica intereses coincidentes",
);
const request = await check(
  b.client.rpc("request_to_join", {
    p_group_id: groupId,
    p_message: "Quiero colaborar",
  }),
);
const requestRow = Array.isArray(request) ? request[0] : request;
const received = await check(
  a.client
    .from("group_join_requests")
    .select("*")
    .eq("id", requestRow.id)
    .single(),
);
assert.equal(received.status, "pending", "D: propietario recibe solicitud");
assert.ok(
  (
    await c.client.rpc("decide_join_request", {
      p_request_id: requestRow.id,
      p_decision: "approved",
    })
  ).error,
  "I: C no puede aprobar",
);
await check(
  a.client.rpc("decide_join_request", {
    p_request_id: requestRow.id,
    p_decision: "approved",
  }),
);
await check(
  a.client.rpc("decide_join_request", {
    p_request_id: requestRow.id,
    p_decision: "approved",
  }),
);
const memberships = await check(
  b.client
    .from("group_memberships")
    .select("*")
    .eq("group_id", groupId)
    .eq("user_id", b.id),
);
assert.equal(
  memberships.length,
  1,
  "F/G: B pertenece exactamente una vez y consulta Mis grupos",
);
assert.ok(
  (
    await a.client.rpc("request_to_join", {
      p_group_id: groupId,
      p_message: null,
    })
  ).error,
  "J: propietario no solicita su grupo",
);
const attempted = await c.client
  .from("research_groups")
  .update({ name: "Intrusión" })
  .eq("id", groupId)
  .select();
assert.ok(
  attempted.error || attempted.data.length === 0,
  "H: externo no gestiona grupo",
);
const attemptedByMember = await b.client
  .from("research_groups")
  .update({ name: "Intrusión de miembro" })
  .eq("id", groupId)
  .select();
assert.ok(
  attemptedByMember.error || attemptedByMember.data.length === 0,
  "H: miembro sin admin no gestiona grupo",
);
const projectId = await check(
  a.client.rpc("save_research_project", {
    p_project_id: null,
    p_group_id: groupId,
    p_title: "Proyecto local",
    p_description: "Proyecto privado de prueba",
    p_status: "active",
    p_funding_needed_amount: 1200,
    p_funding_currency: "EUR",
    p_visibility: "private",
    p_topic_ids: [topic],
  }),
);
assert.equal(
  (
    await check(
      b.client.from("research_projects").select("id").eq("id", projectId),
    )
  ).length,
  1,
  "M: miembro consulta proyecto asociado",
);
assert.equal(
  (
    await check(
      c.client.from("research_projects").select("id").eq("id", projectId),
    )
  ).length,
  0,
  "L: externo no lee proyecto privado",
);
assert.equal(
  (
    await check(
      c.client.from("project_topics").select("*").eq("project_id", projectId),
    )
  ).length,
  0,
  "Sin fuga mediante temas",
);
assert.equal(
  (await check(c.client.from("profiles").select("id").eq("id", b.id))).length,
  0,
  "Perfil privado no se revela",
);
// Extended local journey: needs -> own diagnostic -> shown -> explicit feedback.
const needId = await check(a.client.rpc("save_recruitment_need", {
  p_need_id: null, p_group_id: groupId, p_project_id: projectId,
  p_title: "Analista de datos", p_description: "Necesidad local",
  p_required_skills: ["análisis", "Python"], p_status: "open",
}));
assert.ok((await c.client.rpc("diagnose_recruitment_need", {
  p_need_id: needId, p_impression_key: randomUUID(),
})).error, "Proyecto privado no filtra diagnóstico");
const impressionKey = randomUUID();
const diagnosis = await check(b.client.rpc("diagnose_recruitment_need", {
  p_need_id: needId, p_impression_key: impressionKey,
}));
assert.equal(diagnosis.evaluation.coverage, 0.5);
assert.deepEqual(diagnosis.evaluation.missing_skills, ["python"]);
assert.equal(diagnosis.shown_at, null);
const retry = await check(b.client.rpc("diagnose_recruitment_need", {
  p_need_id: needId, p_impression_key: impressionKey,
}));
assert.equal(retry.id, diagnosis.id);
assert.ok((await b.client.rpc("save_recommendation_feedback", {
  p_event_id: diagnosis.id, p_response: "useful", p_comment: "",
})).error, "No feedback antes de visualización");
await check(b.client.rpc("mark_recommendation_shown", { p_event_id: diagnosis.id }));
assert.equal((await check(b.client.from("recommendation_feedback").select("*").eq("event_id", diagnosis.id))).length, 0);
await check(b.client.rpc("save_recommendation_feedback", {
  p_event_id: diagnosis.id, p_response: "useful", p_comment: "Explicación clara",
}));
assert.equal((await check(a.client.from("recommendation_events").select("*").eq("id", diagnosis.id))).length, 0, "Gestor no lee diagnóstico privado");
assert.ok((await a.client.rpc("save_recommendation_feedback", {
  p_event_id: diagnosis.id, p_response: "not_useful", p_comment: "Intrusión",
})).error);
assert.equal((await check(b.client.from("recommendation_feedback").select("*").eq("event_id", diagnosis.id))).length, 1);
console.log("PASS: necesidad, diagnóstico propio, idempotencia, visualización y feedback vía Auth/REST; privacidad de proyecto y perfil conservada.");
for (const user of users) await check(user.client.auth.signOut());
console.log(
  "PASS: colaboración real Supabase Auth + REST + RPC, A–J y L–N. K se verifica con test:concurrency. Datos exclusivamente locales.",
);
