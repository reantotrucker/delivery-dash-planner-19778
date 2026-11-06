import { test, expect } from "bun:test";
import { restoreInteriorDraft, interiorDraftVersion } from "./interiorDraft";

const pedido = { status: "aguardando_conferencia", qtd_volumes: null,
  itens: [{ produto_id: "a", quantidade: 10 }, { produto_id: "b", quantidade: 5 }] };

test("reabrir preserva a quantidade modificada", () => {
  expect(restoreInteriorDraft(pedido, { qty: { a: "7" }, removed: [], volumes: "", updatedAt: "" }).qty.a).toBe("7");
});
test("reabrir preserva exclusão explícita", () => {
  expect(restoreInteriorDraft(pedido, { qty: {}, removed: ["b"], volumes: "", updatedAt: "" }).removed.has("b")).toBe(true);
});
test("volume incompleto pode ser guardado sem concluir conferência", () => {
  expect(restoreInteriorDraft(pedido, { qty: {}, removed: [], volumes: "", updatedAt: "" }).volumes).toBe("");
});
test("nova conferência invalida versão anterior do rascunho", () => {
  expect(interiorDraftVersion(pedido)).not.toBe(interiorDraftVersion({ ...pedido, reaberto_em: "2026-11-06T01:34:00Z" }));
});