import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Bold, CornerDownLeft, Underline } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function LeaveReasonEditor({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = (marker: "**" | "__") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const wrapped = `${marker}${selected}${marker}`;
    const nextValue = value.slice(0, start) + wrapped + value.slice(end);
    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const selectionStart = start + marker.length;
      textarea.setSelectionRange(
        selectionStart,
        selected ? selectionStart + selected.length : selectionStart,
      );
    });
  };

  const insertNewLine = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${value.slice(0, start)}
${value.slice(end)}`;
    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 1, start + 1);
    });
  };

  return (
    <div className="overflow-hidden rounded-md border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
      <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label={t("leaves.reasonBold", "Bold selected text")}
          title={t("leaves.reasonBold", "Bold")}
          onClick={() => wrapSelection("**")}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label={t("leaves.reasonUnderline", "Underline selected text")}
          title={t("leaves.reasonUnderline", "Underline")}
          onClick={() => wrapSelection("__")}
        >
          <Underline className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label={t("leaves.reasonNewLine", "Insert a new line")}
          title={t("leaves.reasonNewLine", "New line")}
          onClick={insertNewLine}
        >
          <CornerDownLeft className="h-4 w-4" />
        </Button>
        <span className="ml-auto text-[11px] text-muted-foreground">{t("leaves.reasonFormattingHint", "Bold / underline / new line")}</span>
      </div>
      <Textarea
        ref={textareaRef}
        id={id}
        required
        aria-required="true"
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-28 resize-y rounded-none border-0 bg-transparent leading-6 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
