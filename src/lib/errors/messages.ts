export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code === "23505")
      return "Este registro ya existe. Revisa el nombre de usuario o la solicitud pendiente.";
    if (code === "42501")
      return "No tienes permiso para realizar esta operación.";
    if (code === "PGRST116")
      return "No encontramos este recurso o no tienes acceso.";
    if (code === "invalid_credentials")
      return "El correo o la contraseña no son correctos.";
    if (code === "email_not_confirmed")
      return "Confirma tu correo antes de iniciar sesión.";
  }
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error)
    return String(error.message);
  return "No se ha podido completar la operación. Inténtalo de nuevo.";
}
