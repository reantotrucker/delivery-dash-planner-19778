import { test, expect } from "bun:test";
import { isConferenceSwipe } from "./interiorSwipe";

test("arrastar para qualquer lado marca o produto", () => {
  expect(isConferenceSwipe(80, 4)).toBe(true);
  expect(isConferenceSwipe(-80, 4)).toBe(true);
});
test("rolagem vertical e pequenos movimentos não marcam produtos", () => {
  expect(isConferenceSwipe(20, 2)).toBe(false);
  expect(isConferenceSwipe(70, 90)).toBe(false);
});