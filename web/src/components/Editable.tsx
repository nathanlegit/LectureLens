import { useEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * Click-to-edit text in the Notion style: looks like plain text, edits in place.
 * Enter or clicking away saves, Escape cancels. onSave may throw to reject the change.
 */
export function EditableText({
  value,
  onSave,
  label,
  className = "",
  placeholder,
  allowEmpty = false,
  editing: controlledEditing,
  onEditingChange,
}: {
  value: string;
  onSave: (next: string) => Promise<unknown>;
  /** Accessible name, e.g. "Lecture title". */
  label: string;
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [ownEditing, setOwnEditing] = useState(false);
  const editing = controlledEditing ?? ownEditing;
  const setEditing = (e: boolean) => (onEditingChange ? onEditingChange(e) : setOwnEditing(e));
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => input.current?.select());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function commit() {
    const next = draft.trim();
    if (saving) return;
    if (next === value.trim() || (!next && !allowEmpty)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't save that change");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void commit()}
        className={`-mx-1 w-full min-w-0 rounded-md bg-hover px-1 outline-none ring-2 ring-accent-soft ${className}`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={`Rename: click to edit`}
      aria-label={`${label}: ${value}. Click to rename`}
      className={`-mx-1 max-w-full cursor-text rounded-md px-1 text-left transition-colors hover:bg-hover ${className}`}
    >
      {value || <span className="text-faint">{placeholder}</span>}
    </button>
  );
}

/** A small "⋯" menu; items run on click and the menu closes on outside click or Escape. */
export function MoreMenu({ label, items }: { label: string; items: { label: string; danger?: boolean; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | globalThis.KeyboardEvent) => {
      if (e instanceof globalThis.KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="btn btn-ghost btn-sm px-1.5">
        <span aria-hidden className="text-base leading-none tracking-widest">⋯</span>
      </button>
      {open && (
        <div role="menu" className="card anim-pop origin-tr absolute right-0 z-30 mt-1 min-w-44 p-1 shadow-float">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                item.danger ? "text-bad hover:bg-bad-soft" : "text-ink hover:bg-hover"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
