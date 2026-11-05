import { useRef, useState, type ReactNode, type PointerEvent } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { conferenceSwipeValue } from "@/lib/interiorSwipe";

interface Props {
  storageKey: string;
  disabled: boolean;
  className: string;
  children: ReactNode;
}

export function SwipeConferenceRow({ storageKey, disabled, className, children }: Props) {
  const [checked, setChecked] = useState(() => {
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const dragged = useRef(false);

  const mark = (value: boolean) => {
    if (disabled) return;
    setChecked(value);
    try {
      if (value) localStorage.setItem(storageKey, "1");
      else localStorage.removeItem(storageKey);
    } catch { /* Visual checking remains available without browser storage. */ }
  };

  const finish = (event: PointerEvent<HTMLTableRowElement>) => {
    const origin = start.current;
    if (!origin || origin.id !== event.pointerId) return;
    const value = conferenceSwipeValue(event.clientX - origin.x, event.clientY - origin.y);
    if (value !== null) {
      mark(value);
      dragged.current = true;
    }
    start.current = null;
    setOffset(0);
  };

  return (
    <tr
      data-checked={checked}
      className={`${className} touch-pan-y ${checked ? "bg-success/20 border-success/50" : ""}`}
      style={{ transform: `translateX(${offset}px)` }}
      onPointerDown={(event) => {
        dragged.current = false;
        if (disabled || event.button !== 0 || (event.target as HTMLElement).closest("input,button,a")) return;
        start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const origin = start.current;
        if (!origin || origin.id !== event.pointerId) return;
        const dx = event.clientX - origin.x;
        const dy = event.clientY - origin.y;
        if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10) {
          setOffset(Math.max(-80, Math.min(80, dx)));
        }
      }}
      onPointerUp={finish}
      onPointerCancel={() => { start.current = null; setOffset(0); }}
      onLostPointerCapture={() => { start.current = null; setOffset(0); }}
      onClickCapture={(event) => {
        if (dragged.current) { event.preventDefault(); event.stopPropagation(); dragged.current = false; }
      }}
    >
      <td className="w-9 p-1 align-middle">
        <Button
          size="icon"
          variant="ghost"
          disabled={disabled}
          aria-label={checked ? "Desmarcar produto" : "Marcar produto conferido"}
          aria-pressed={checked}
          title={checked ? "Desmarcar produto" : "Marcar produto conferido"}
          className={`h-7 w-7 ${checked ? "text-success" : "text-muted-foreground/40"}`}
          onClick={() => mark(!checked)}
        >
          <Check className="h-4 w-4" />
        </Button>
      </td>
      {children}
    </tr>
  );
}