import { test, expect } from "bun:test";
import { canReturnToAuthorization } from "../../supabase/functions/interior-proxy/authorization";

test("pedidos recebidos e conferidos podem retornar para autorização", () => {
  expect(canReturnToAuthorization("aguardando_conferencia", false, false)).toBe(true);
  expect(canReturnToAuthorization("conferido", true, false)).toBe(true);
});
test("pedidos enviados, faturados ou cancelados não podem retornar", () => {
  for (const status of ["enviado", "enviado_omie", "faturado", "cancelado"]) {
    expect(canReturnToAuthorization(status, true, false)).toBe(false);
  }
});
test("comercial somente consulta e administrador pode retornar", () => {
  expect(canReturnToAuthorization("conferido", false, true)).toBe(false);
  expect(canReturnToAuthorization("conferido", true, true)).toBe(true);
});