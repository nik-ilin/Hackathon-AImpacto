import { backend } from "./client";

export type MutationIdentity = { userId: string; isCurrent: () => boolean };

export async function sessionForUser(userId: string) {
  const { data, error } = await backend().auth.getSession();
  if (error) throw error;
  if (!data.session || data.session.user.id !== userId)
    throw new Error("La cuenta ha cambiado. Vuelve a abrir el formulario.");
  return data.session;
}

export async function mutationSession(
  identity: MutationIdentity,
  needsProfile = false,
) {
  const session = await sessionForUser(identity.userId);
  const { data, error } = await backend().auth.getUser(session.access_token);
  if (error) throw error;
  if (data.user?.id !== identity.userId || !identity.isCurrent())
    throw new Error("La cuenta ha cambiado. Vuelve a abrir el formulario.");
  if (needsProfile) {
    const profile = await backend()
      .from("profiles")
      .select("id")
      .eq("id", identity.userId)
      .maybeSingle()
      .setHeader("Authorization", `Bearer ${session.access_token}`);
    if (profile.error) throw profile.error;
    if (!profile.data)
      throw new Error("Completa tu perfil antes de continuar.");
  }
  const current = await sessionForUser(identity.userId);
  if (!identity.isCurrent())
    throw new Error(
      "La edición ya no está activa. Vuelve a abrir el formulario.",
    );
  // Pin each request to this identity: fetchWithAuth may await a later session.
  return current;
}
