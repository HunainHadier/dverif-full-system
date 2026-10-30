import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CalendarCheck, Clock3, MapPin, Video } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { PageHeader } from "@/components/common/PageHeader";
import { FormDialog } from "@/components/hr/FormDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { interviewsService, type Interview } from "@/services";
import { apiErrorMessage, formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/my-interviews")({
  head: () => ({ meta: [{ title: "My Assigned Interviews — Dverif" }] }),
  component: MyAssignedInterviewsPage,
});

type FeedbackForm = {
  status: "completed" | "cancelled";
  outcome: "pending" | "passed" | "failed";
  rating: string;
  feedback_notes: string;
};

function MyAssignedInterviewsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Interview | null>(null);
  const list = useQuery({
    queryKey: ["my-assigned-interviews"],
    queryFn: () => interviewsService.myAssigned(),
  });
  const form = useForm<FeedbackForm>({
    defaultValues: { status: "completed", outcome: "pending", rating: "", feedback_notes: "" },
  });
  const { reset } = form;
  useEffect(() => {
    if (!selected) return;
    reset({ status: "completed", outcome: "pending", rating: "", feedback_notes: "" });
  }, [selected, reset]);

  const save = useMutation({
    mutationFn: (values: FeedbackForm) => interviewsService.recordMyFeedback(selected!.uuid, {
      status: values.status,
      outcome: values.status === "cancelled" ? "pending" : values.outcome,
      rating: values.rating.trim() ? Number(values.rating) : null,
      feedback_notes: values.feedback_notes || undefined,
    }),
    onSuccess: () => {
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ["my-assigned-interviews"] });
      void qc.invalidateQueries({ queryKey: ["recruitment-interviews"] });
      toast.success("Interview feedback saved");
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error, "Could not save interview feedback")),
  });

  const items = list.data ?? [];
  return (
    <ModuleGate module="recruitment_management">
      <div className="space-y-4">
        <PageHeader
          title="My Assigned Interviews"
          description="Interviews assigned to your account. Only you can record their feedback."
        />
        {list.isLoading ? <p className="text-sm text-muted-foreground">Loading assigned interviews…</p> : null}
        {list.isError ? <p className="text-sm text-destructive">{apiErrorMessage(list.error, "Could not load assigned interviews")}</p> : null}
        {!list.isLoading && !items.length ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            No interviews have been assigned to you yet.
          </CardContent></Card>
        ) : null}
        <div className="grid gap-3">
          {items.map((interview) => (
            <Card key={interview.uuid}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{interview.candidate_name ?? "Candidate"}</p>
                    <Badge variant={interview.status === "completed" ? "secondary" : interview.status === "cancelled" ? "destructive" : "outline"}>{interview.status}</Badge>
                    <Badge variant={interview.outcome === "passed" ? "default" : interview.outcome === "failed" ? "destructive" : "outline"}>{interview.outcome}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDateTime(interview.scheduled_at)}</span>
                    <span className="inline-flex items-center gap-1">{interview.mode === "video" ? <Video className="h-3.5 w-3.5" /> : null}{interview.mode ?? "Interview"}</span>
                    {interview.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{interview.location}</span> : null}
                  </div>
                </div>
                {interview.status === "scheduled" ? (
                  <Button onClick={() => setSelected(interview)}><CalendarCheck className="mr-2 h-4 w-4" />Record feedback</Button>
                ) : <span className="text-xs text-muted-foreground">Feedback recorded</span>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <FormDialog
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        form={form}
        title="Record interview feedback"
        description={selected?.candidate_name ?? undefined}
        submitLabel="Save feedback"
        cancelLabel="Cancel"
        onSubmit={(values) => save.mutate(values)}
      >
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Interview status</span>
            <select {...form.register("status")} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          {form.watch("status") === "completed" ? (
            <>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Outcome</span>
                <select {...form.register("outcome")} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="pending">Pending decision</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Rating (0–5)</span>
                <input type="number" min={0} max={5} step="0.1" {...form.register("rating")} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Feedback notes</span>
                <textarea rows={4} {...form.register("feedback_notes")} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
              </label>
            </>
          ) : <p className="text-sm text-muted-foreground">Cancelled interviews cannot have a pass/fail outcome.</p>}
        </div>
      </FormDialog>
    </ModuleGate>
  );
}
