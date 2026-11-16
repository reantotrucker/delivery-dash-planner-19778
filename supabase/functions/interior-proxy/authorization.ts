export function canReturnToAuthorization(status: string, isAdmin: boolean, isComercial: boolean) {
  return (isAdmin || !isComercial) && ["aguardando_conferencia", "conferido"].includes(status);
}