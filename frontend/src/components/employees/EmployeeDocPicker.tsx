import { useState } from "react";
import { FileUp, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import {
  UPLOADABLE_DOC_ACCEPT,
  UPLOADABLE_DOC_EXTENSIONS,
} from "@/lib/documentTypes";
import { useDocumentTypes } from "@/lib/useDocumentTypes";
import { formatFileSize } from "@/lib/utils";

export type StagedDoc = { name: string; file: File };

export const MAX_DOC_SIZE = 10 * 1024 * 1024;

/**
 * Re-exported for callers that validated uploads before this list was shared.
 * Kept as a plain array so `.includes(ext)` stays type-safe.
 */
export const ALLOWED_DOC_EXT: readonly string[] = UPLOADABLE_DOC_EXTENSIONS;

export function validateDocFile(file: File): string | null {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_DOC_EXT.includes(ext)) {
    return `Unsupported file type "${ext}". Allowed: ${ALLOWED_DOC_EXT.join(", ")}`;
  }
  if (file.size > MAX_DOC_SIZE) {
    return `"${file.name}" is too large (${formatFileSize(file.size)}). Maximum size is 10MB.`;
  }
  return null;
}

export function EmployeeDocPicker({
  docs,
  onChange,
  onUpload,
  uploading,
  note,
  className,
}: {
  docs: StagedDoc[];
  onChange: (docs: StagedDoc[]) => void;
  onUpload?: () => void;
  uploading?: boolean;
  note?: string;
  className?: string;
}) {
  const [docType, setDocType] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  // Stage immediately on file selection. Previously the file was only held in
  // local state and had to be committed with a separate "Add Doc" click, so a
  // user who picked a file and went straight to Save silently lost the
  // document — the staged list stayed empty and nothing was uploaded.
  const stagePickedFile = (picked: File | null) => {
    setDocFile(picked);
    setError("");
    if (!picked) return;

    if (!docType) {
      setError("Please select a document type — your file has not been added yet.");
      return;
    }
    const problem = validateDocFile(picked);
    if (problem) {
      setError(problem);
      return;
    }
    onChange([...docs, { name: docType, file: picked }]);
    setDocType("");
    setDocFile(null);
  };

  const addDoc = () => {
    if (!docFile) {
      setError("Please choose a file first.");
      return;
    }
    if (!docType) {
      setError("Please select a document type.");
      return;
    }
    const problem = validateDocFile(docFile);
    if (problem) {
      setError(problem);
      return;
    }
    onChange([...docs, { name: docType, file: docFile }]);
    setDocType("");
    setDocFile(null);
    setError("");
  };

  // The catalogue is fetched from the API so a type a system admin added appears
  // here without a frontend deploy; the built-in list stands in if it is
  // unreachable, so this picker can never be emptied out by a failed request.
  const { items: documentTypeOptions } = useDocumentTypes();

  return (
    <div className={`space-y-2 ${className || ""}`}>
      <div className="grid gap-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Document Type</Label>
            <SearchableSelect
              items={documentTypeOptions}
              value={docType}
              onChange={setDocType}
              placeholder="Select document type"
              searchPlaceholder="Search document type…"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">File (up to 10MB)</Label>
            <Input
              type="file"
              accept={UPLOADABLE_DOC_ACCEPT}
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                stagePickedFile(picked);
                e.target.value = "";
              }}
              className="w-full min-w-0 text-sm"
            />
            {docFile ? (
              <div className="mt-1 break-all text-xs text-muted-foreground">
                Selected: {docFile.name} — click <span className="font-medium text-foreground">Add Doc</span> to attach it
              </div>
            ) : null}
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addDoc}>
          <FileUp className="mr-1.5 h-3.5 w-3.5" /> Add Doc
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map((d, idx) => (
            <div key={`${idx}-${d.file.name}`} className="flex min-w-0 max-w-full flex-col items-start gap-2 rounded-md border border-border px-2 py-1.5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="flex min-w-0 w-full items-center gap-2 sm:max-w-[70%]">
                <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 break-all">
                  {d.name && <span className="font-medium">{d.name} — </span>}
                  <span className="text-muted-foreground">{d.file.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(d.file.size)}</span>
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(docs.filter((_, i) => i !== idx))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {note && <p className="text-xs text-muted-foreground break-words">{note}</p>}
          {onUpload && (
            <Button type="button" size="sm" variant="secondary" onClick={onUpload} loading={uploading}>
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload {docs.length} doc(s)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}