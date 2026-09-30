import { Button } from "@/components/ui/button";

/** "Page 2 deleted. Undo" shown after a change. */
export function UndoBar({ message, onUndo, busy }: { message: string; onUndo: () => void; busy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted px-3 py-2 text-sm">
      <span>{message}</span>
      <Button variant="outline" size="xs" onClick={onUndo} disabled={busy}>
        {busy ? "Undoing…" : "Undo"}
      </Button>
    </div>
  );
}
