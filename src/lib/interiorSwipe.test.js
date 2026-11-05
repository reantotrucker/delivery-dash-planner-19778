import { test, expect } from "bun:test";
import { isConferenceSwipe, conferenceSwipeValue } from "./interiorSwipe";

test("arrastar para direita marca o produto", () => {
  expect(conferenceSwipeValue(80, 4)).toBe(true);
});
test("arrastar para esquerda desmarca o produto", () => {
  expect(conferenceSwipeValue(-80, 4)).toBe(false);
});
test("rolagem vertical e pequenos movimentos não marcam produtos", () => {
  expect(isConferenceSwipe(20, 2)).toBe(false);
  expect(isConferenceSwipe(70, 90)).toBe(false);
  expect(conferenceSwipeValue(70, 90)).toBe(null);
});