import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, X, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Drag-and-drop file input.
 *
 * GENUINELY NEW: `grep onDrop|dataTransfer` returns zero hits across this
 * codebase, so every upload today is a bare `<input type="file">`. The HR
 * modules attach receipts, invoices, certificates and tickets constantly, and a
 * phone-photo receipt is the single most common upload in the product — making
 * the user open a file picker, navigate a device UI, and pick the right camera
 * roll is the worst possible path for that one file.
 *
 * VALIDATION IS CLIENT-SIDE ONLY AND THEREFORE ADVISORY. Size and type are
 * checked here to fail fast, but the server's allow-list is the real gate:
 * a browser can be bypassed, so nothing here may be treated as a security
 * control. The limits passed in should mirror the server's multer config.
 */
export function FileDropzone({
  value,
  onChange,
  accept,
  maxSizeMb = 10,
  maxFiles = 5,
  disabled = false,
  label,
  hint,
  className,
}: {
  value: File[];
  onChange: (files: File[]) => void;
  /** Mirrors the `accept` attribute, e.g. ".pdf,.jpg,image/*". */
  accept?: string;
  maxSizeMb?: number;
  maxFiles?: number;
  disabled?: boolean;
  label?: string;
  hint?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  // One message for the whole batch: a user dropping eight receipts should be
  // told which ones failed, not see eight transient toasts.
  const [error, setError] = useState<string | null>(null);

  const accepts = (file: File) => {
    if (!accept) return true;
    // `accept` may carry MIME types and/or extensions; test both.
    const patterns = accept
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return patterns.some((p) => {
      if (p.startsWith(".")) return name.endsWith(p);
      if (p.endsWith("/*")) return type.startsWith(p.slice(0, -1));
      return type === p;
    });
  };

  const addFiles = useCallback(
    (incoming: FileList | File[] | null) => {
      if (!incoming) return;
      const list = Array.from(incoming);
      if (!list.length) return;

      const rejected: string[] = [];
      const accepted: File[] = [];

      for (const file of list) {
        if (!accepts(file)) {
          rejected.push(`${file.name} (type)`);
          continue;
        }
        if (file.size > maxSizeMb * 1024 * 1024) {
          rejected.push(`${file.name} (>${maxSizeMb}MB)`);
          continue;
        }
        accepted.push(file);
      }

      // De-duplicate by name+size so re-adding the same file is a no-op rather
      // than a duplicate row.
      const merged = [...value];
      for (const file of accepted) {
        if (merged.some((f) => f.name === file.name && f.size === file.size)) continue;
        merged.push(file);
      }
      const limited = merged.slice(0, maxFiles);
      const dropped = merged.length - limited.length;

      const problems = [...rejected];
      if (dropped > 0) problems.push(t("hr.fileDropzone.overLimit", { count: dropped }));

      setError(problems.length ? problems.join(", ") : null);
      onChange(limited);
    },
    // `accepts` closes over `accept`; including it keeps the callback honest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, onChange, accept, maxSizeMb, maxFiles, t],
  );

  const removeAt = (index: number) => {
    setError(null);
    onChange(value.filter((_, i) => i !== index));
  };

  const openPicker = () => {
    if (disabled) return;
    setError(null);
    inputRef.current?.click();
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label ? <p className="text-sm font-medium">{label}</p> : null}

      {/* The visual target wraps a real <button>, so this is keyboard-reachable
          and announces correctly — a bare <div onClick> would not be. */}
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
          disabled && "cursor-not-allowed opacity-60",
          error && "border-destructive/60",
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <span className="text-sm font-medium">
          {dragging ? t("hr.fileDropzone.dropHere") : t("hr.fileDropzone.choose")}
        </span>
        <span className="text-xs text-muted-foreground">
          {hint ?? t("hr.fileDropzone.hint", { maxFiles, maxSizeMb })}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={maxFiles > 1}
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          // Reset so picking the same file twice still fires a change event.
          e.target.value = "";
        }}
      />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {value.length ? (
        <ul className="space-y-1">
          {value.map((file, i) => (
            <li
              key={`${file.name}-${file.size}`}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              {file.type.startsWith("image/") ? (
                <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={t("hr.fileDropzone.remove", { name: file.name })}
                onClick={() => removeAt(i)}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
