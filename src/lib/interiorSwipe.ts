export function isConferenceSwipe(dx: number, dy: number) {
  return Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

export function conferenceSwipeValue(dx: number, dy: number): boolean | null {
  return isConferenceSwipe(dx, dy) ? dx > 0 : null;
}