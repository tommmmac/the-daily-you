import { useState } from "react";
import { Button } from "@/components/ui/button";

/** A button that asks "Sure?" inline before running `onConfirm`, instead of a browser dialog. */
export function ConfirmButton({
  label,
  confirmLabel = "Yes, delete",
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button variant="ghost" size="xs" disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Button
        variant="destructive"
        size="xs"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size="xs" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}
