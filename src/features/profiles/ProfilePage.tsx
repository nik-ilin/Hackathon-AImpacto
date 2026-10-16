import { useCallback, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { z } from "zod";
import type { Tables } from "../../types/database";
import { useAuth } from "../../app/providers/auth-context";
import {
  Button,
  Field,
  Notice,
  PageHeading,
  ResourceState,
  TopicPicker,
} from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import {
  getProfile,
  getProfileTopics,
  getTopics,
  saveProfile,
} from "../../lib/supabase/api";
import { errorMessage } from "../../lib/errors/messages";
import { profileSchema, validationMessage } from "../../lib/validation/schemas";

const initial: z.infer<typeof profileSchema> = {
  full_name: "",
  username: "",
  institution: "",
  country: "",
  academic_stage: "",
  bio: "",
  skills: "",
  orcid_id: "",
  visibility: "private",
};
export function ProfilePage({ onboarding = false }: { onboarding?: boolean }) {
  const { session } = useAuth();
  const userId = session!.user.id;
  const resource = useResource(
    useCallback(async () => {
      const [profile, selected, topics] = await Promise.all([
        getProfile(userId),
        getProfileTopics(userId),
        getTopics(),
      ]);
      return { profile, selected, topics };
    }, [userId]),
  );
  return (
    <ResourceState {...resource} retry={() => void resource.reload()}>
      {resource.data && (
        <ProfileEditor
          key={userId}
          profile={resource.data.profile}
          topics={resource.data.topics}
          initialSelected={resource.data.selected}
          onboarding={onboarding}
        />
      )}
    </ResourceState>
  );
}
function ProfileEditor({
  profile,
  topics,
  initialSelected,
  onboarding,
}: {
  profile: Tables<"profiles"> | null;
  topics: Tables<"topics">[];
  initialSelected: string[];
  onboarding: boolean;
}) {
  const navigate = useNavigate();
  const [values, setValues] = useState<z.infer<typeof profileSchema>>(() =>
    profile
      ? {
          full_name: profile.full_name,
          username: profile.username ?? "",
          institution: profile.institution,
          country: profile.country,
          academic_stage: profile.academic_stage ?? "",
          bio: profile.bio,
          skills: profile.skills.join(", "),
          orcid_id: profile.orcid_id ?? "",
          visibility: profile.visibility,
        }
      : initial,
  );
  const [selected, setSelected] = useState(initialSelected);
  const [intent, setIntent] = useState("/explore");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  function update<K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K],
  ) {
    setValues((old) => ({ ...old, [key]: value }));
    setSuccess(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      setError(validationMessage(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await saveProfile(parsed.data, selected);
      if (onboarding) navigate(intent);
      else setSuccess(true);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={onboarding ? "TU PRIMER PASO" : "TU IDENTIDAD CIENTÍFICA"}
        title={onboarding ? "Hagamos espacio a tus intereses." : "Mi perfil"}
      >
        Tus intereses ayudan a descubrir grupos afines. Tu etapa académica nunca
        limita lo que puedes hacer.
      </PageHeading>

      <form
        className="panel form-stack profile-form"
        onSubmit={(event) => void submit(event)}
      >
        {error && <Notice>{error}</Notice>}
        {success && (
          <Notice success>Perfil e intereses guardados correctamente.</Notice>
        )}
        <div className="form-grid">
          <Field label="Nombre completo">
            <input
              required
              maxLength={150}
              value={values.full_name}
              onChange={(event) => update("full_name", event.target.value)}
              autoComplete="name"
            />
          </Field>
          <Field label="Nombre de usuario (opcional)">
            <input
              value={values.username}
              onChange={(event) => update("username", event.target.value)}
              maxLength={40}
              autoComplete="username"
            />
          </Field>
          <Field label="Institución">
            <input
              value={values.institution}
              onChange={(event) => update("institution", event.target.value)}
              maxLength={200}
              autoComplete="organization"
            />
          </Field>
          <Field label="País">
            <input
              value={values.country}
              onChange={(event) => update("country", event.target.value)}
              maxLength={100}
              autoComplete="country-name"
            />
          </Field>
          <Field label="Etapa académica">
            <select
              value={values.academic_stage}
              onChange={(event) =>
                update(
                  "academic_stage",
                  event.target.value as typeof values.academic_stage,
                )
              }
            >
              <option value="">Prefiero no indicarlo</option>
              <option value="student">Estudiante</option>
              <option value="phd">Doctorado</option>
              <option value="postdoc">Posdoctorado</option>
              <option value="researcher">Investigador/a</option>
              <option value="other">Otra etapa</option>
            </select>
          </Field>
          <Field label="ORCID (opcional)">
            <input
              value={values.orcid_id}
              onChange={(event) => update("orcid_id", event.target.value)}
              placeholder="0000-0000-0000-000X"
              maxLength={19}
            />
          </Field>
        </div>
        <Field label="Sobre tu investigación">
          <textarea
            rows={4}
            value={values.bio}
            onChange={(event) => update("bio", event.target.value)}
            maxLength={3000}
            placeholder="¿Qué preguntas te gustaría explorar?"
          />
        </Field>
        <Field
          label="Competencias"
          hint="Sepáralas con comas. Por ejemplo: Python, microscopía, análisis estadístico."
        >
          <input
            value={values.skills}
            onChange={(event) => update("skills", event.target.value)}
            maxLength={2000}
          />
        </Field>
        <TopicPicker
          topics={topics}
          selected={selected}
          onChange={setSelected}
        />
        <Field
          label="Visibilidad del perfil"
          hint="Un perfil privado solo puede ser consultado por ti. Los miembros de tus grupos verán una referencia de participante."
        >
          <select
            value={values.visibility}
            onChange={(event) =>
              update(
                "visibility",
                event.target.value as typeof values.visibility,
              )
            }
          >
            <option value="public">Público</option>
            <option value="private">Privado</option>
          </select>
        </Field>
        {onboarding && (
          <fieldset className="intent-picker">
            <legend>¿Qué quieres hacer primero?</legend>
            {[
              ["/explore", "Encontrar un grupo de investigación"],
              ["/groups/new", "Crear un grupo de investigación"],
              ["/explore?view=projects", "Explorar proyectos de grupos"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="intent"
                  value={value}
                  checked={intent === value}
                  onChange={() => setIntent(value!)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        <div className="form-actions">
          <Button disabled={busy} type="submit">
            {busy
              ? "Guardando…"
              : onboarding
                ? "Guardar y comenzar"
                : "Guardar perfil"}
          </Button>
        </div>
      </form>
    </>
  );
}
