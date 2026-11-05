export function isConferenceSwipe(dx: number, dy: number) {
  return Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy) * 1.5;
}