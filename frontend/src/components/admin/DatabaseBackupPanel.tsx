import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Database,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
  Table2,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { adminService } from "@/services";
import { apiErrorMessage } from "@/lib/utils";

/**
 * Full database backup — system admin only.
 *
 * One click produces a .sql file containing every table's CREATE TABLE and every
 * row of data, ready to replay with `mysql < file.sql`. Nothing is stored on the
 * server: the dump is streamed straight to the browser, so there is no backup
 * folder to fill up and no stale copies lying around on disk.
 *
 * THE FILE IS A SECRET. It contains every user's hashed password, the encrypted
 * CNIC values on `persons`, and all business data. It is called out here rather
 * than left implicit, because a backup that gets emailed around or dropped in a
 * shared folder is a full data breach even when nothing was "hacked".
 */
export function DatabaseBackupPanel() {
  const [downloading, setDownloading] = useState(false);
  const [lastBackup, setLastBackup] = useState<{ at: string; bytes: number } | null>(null);

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await adminService.downloadDatabaseBackup();

      // On failure axios resolves with a Blob holding the JSON error envelope
      // (a blob download bypasses the response interceptor), so "we got a blob"
      // does NOT mean "we got a dump". Check the type before offering a file the
      // user would then try to open.
      const type = blob.type || "";
      if (type.includes("application/json")) {
        let message = "The backup could not be created.";
        try {
          const parsed = JSON.parse(await blob.text());
          message = parsed?.message ?? message;
        } catch {
          /* keep the default */
        }
        throw new Error(message);
      }

      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dverif-backup-${stamp}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on the next tick: revoking synchronously right after click()
      // can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setLastBackup({ at: new Date().toLocaleString(), bytes: blob.size });
      toast.success("Backup downloaded");
    } catch (e) {
      toast.error(apiErrorMessage(e, (e as Error)?.message || "Backup failed"));
    } finally {
      setDownloading(false);
    }
  };

  const prettySize = (bytes: number) =>
    bytes > 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`;

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            Database backup
          </CardTitle>
          <CardDescription className="mt-1">
            Download the entire database — every table&apos;s structure and every row — as a single{" "}
            <code className="text-xs">.sql</code> file.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1 text-xs text-amber-800 dark:text-amber-300">
                <p className="font-semibold">This file contains everything.</p>
                <p>
                  Including every user&apos;s hashed password, the encrypted CNIC values held
                  against each person, and all business records. Anyone holding this file could
                  impersonate an account, so store it somewhere encrypted and never send it over
                  plain email.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={download} disabled={downloading} loading={downloading}>
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {downloading ? "Building backup…" : "Download backup"}
            </Button>

            {lastBackup && (
              <span className="text-xs text-muted-foreground">
                Last downloaded {lastBackup.at} ({prettySize(lastBackup.bytes)})
              </span>
            )}
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">What&apos;s in the file</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <Table2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  A <code className="text-[11px]">CREATE TABLE</code> for every table, including its
                  indexes and foreign keys.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Every row, as <code className="text-[11px]">INSERT</code> statements, with quotes
                  and special characters escaped.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Recorded in the audit log with your account, along with the table and row counts.
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <p className="mb-1 text-xs font-medium text-foreground">To restore it</p>
            <code className="block overflow-x-auto text-[11px] text-muted-foreground">
              mysql -u &lt;user&gt; -p &lt;database&gt; &lt; dverif-backup-YYYYMMDD-HHMM.sql
            </code>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-muted/20 shadow-none">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            <Badge variant="outline" className="mr-2 align-middle">
              Note
            </Badge>
            The backup is generated on demand and streamed straight to your browser — nothing is
            kept on the server. On a large database it can take a little while, so leave the tab
            open until the download starts.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
