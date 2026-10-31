import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, Plus, Download, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IssueLetterDialog } from "@/components/hr/IssueLetterDialog";
import { letterTemplatesService, hrLettersService, HR_LETTER_TYPES, type HrLetterListItem, type HrLetterType, type UUID } from "@/services";

export function EmployeeLettersPanel({ employeeUuid }: { employeeUuid: UUID }) {
  const qc = useQueryClient();
  const [templateUuid, setTemplateUuid] = useState("");
  const [letterType, setLetterType] = useState<HrLetterType>("custom");
  const [reviewLetter, setReviewLetter] = useState<HrLetterListItem | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const templates = useQuery({
    queryKey: ["employee-letter-templates"],
    queryFn: () => letterTemplatesService.list(),
  });
  const letters = useQuery({
    queryKey: ["hr-letters", "employee", employeeUuid],
    queryFn: () => hrLettersService.list({ employee_uuid: employeeUuid, page: 1, limit: 50 }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["hr-letters"] });
    qc.invalidateQueries({ queryKey: ["org-employee", employeeUuid] });
  };

  const create = useMutation({
    mutationFn: () => hrLettersService.create({
      employee_uuid: employeeUuid,
      template_uuid: templateUuid || undefined,
      letter_type: letterType,
    }),
    onSuccess: (letter) => {
      toast.success("Letter draft created");
      refresh();
      setReviewLetter(letter as HrLetterListItem);
      setReviewOpen(true);
      setTemplateUuid("");
    },
    onError: (error: any) => toast.error(error?.response?.data?.message ?? "Could not create letter draft"),
  });

  const download = useMutation({
    mutationFn: (uuid: UUID) => hrLettersService.downloadPdf(uuid),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onError: () => toast.error("Could not download letter"),
  });

  return (
    <div className="space-y-5">
      <Card className="border-border/70 shadow-none">
        <CardContent className="space-y-3 p-4">
          <div>
            <h3 className="text-sm font-semibold">Assign a Letter</h3>
            <p className="text-xs text-muted-foreground">Choose a template to create a draft for this employee. Review and issue it after checking the preview.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
            <select value={templateUuid} onChange={(e) => {
              const value = e.target.value;
              setTemplateUuid(value);
              const selected = templates.data?.items.find((item) => item.uuid === value);
              if (selected) setLetterType(selected.letter_type);
            }} className="h-9 rounded-md border border-input bg-background px-3 text-sm" disabled={templates.isLoading}>
              <option value="">Select letter template</option>
              {(templates.data?.items ?? []).filter((item) => item.is_active).map((item) => <option key={item.uuid} value={item.uuid}>{item.name}</option>)}
            </select>
            <select value={letterType} onChange={(e) => setLetterType(e.target.value as HrLetterType)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              {HR_LETTER_TYPES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !templateUuid || templates.isLoading}>
              <Plus className="mr-1.5 h-4 w-4" /> Create Draft
            </Button>
          </div>
          {templates.isError && <p className="text-sm text-destructive">Could not load letter templates.</p>}
          {!templates.isLoading && (templates.data?.items.filter((item) => item.is_active).length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No active templates. Create a template in Letter Templates first.</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Assigned Letters</h3>
        {letters.isLoading ? <p className="text-sm text-muted-foreground">Loading letters…</p> :
          (letters.data?.items.length ?? 0) === 0 ? (
            <Card className="border-border/70 shadow-none"><CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground"><FileSignature className="h-5 w-5" />No letters assigned to this employee yet.</CardContent></Card>
          ) : (letters.data?.items ?? []).map((letter) => (
            <Card key={letter.uuid} className="border-border/70 shadow-none">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{letter.title || HR_LETTER_TYPES.find((item) => item.key === letter.letter_type)?.label || letter.letter_type}</p>
                  <p className="text-xs text-muted-foreground">{letter.reference_no} · {new Date(letter.created_at).toLocaleDateString("en-PK")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={letter.status === "issued" ? "default" : letter.status === "revoked" ? "destructive" : "secondary"}>{letter.status}</Badge>
                  {letter.status === "draft" && <Button size="sm" onClick={() => { setReviewLetter(letter); setReviewOpen(true); }}><Send className="mr-1.5 h-3.5 w-3.5" /> Review & Issue</Button>}
                  {letter.status !== "draft" && <Button size="sm" variant="outline" onClick={() => download.mutate(letter.uuid)} disabled={download.isPending}><Download className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      <IssueLetterDialog
        letter={reviewLetter}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onIssued={() => { refresh(); setReviewLetter(null); }}
      />
    </div>
  );
}
