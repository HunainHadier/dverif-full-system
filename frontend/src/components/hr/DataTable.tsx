import { type ReactNode } from "react";
import { type LucideIcon, Table2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";

/**
 * Generic sortable/filterable/paginated table for the HR modules.
 *
 * WHY THIS EXISTS. Before it, every HR page hand-rolled the same four pieces:
 * a `<table>` with its own header, a loading state, an empty state, and a
 * prev/next pager. They drifted — some showed a spinner over stale rows, some
 * showed an empty state while loading, and one of them rendered the pager even
 * with zero results. This component settles all of that in one place.
 *
 * IT IS DELIBERATELY DUMB. It owns layout and states, and nothing about your
 * data: fetching stays in the route file's TanStack Query call, so a table
 * re-renders on refetch without this component knowing a query exists.
 */

export type DataTableColumn<T> = {
  /** Stable key. Also the sort/accessor name when `sortable` is set. */
  key: string;
  header: ReactNode;
  /** Cell renderer. Keep it pure — it re-runs on every parent render. */
  render: (row: T, index: number) => ReactNode;
  /** Extra classes on the cell, e.g. "text-right" for money columns. */
  className?: string;
  headerClassName?: string;
  /** Reserved for a future server-side sort; harmless while unused. */
  sortable?: boolean;
};

/**
 * Placeholder rows shown while the first page loads.
 *
 * Named DataTableSkeleton, NOT TableSkeleton: routes/_app.requests.tsx already
 * exports a component called TableSkeleton, and it is a centred loader spinner
 * rather than a skeleton table. Two same-named components with different
 * purposes is a reliable source of confusion at an import site.
 */
export function DataTableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DataTable<T>({
  columns,
  rows,
  total = 0,
  page = 1,
  totalPages = 1,
  onPageChange,
  loading = false,
  onRowClick,
  caption,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  /** Show the pager even for a single page — useful when total is meaningful. */
  showPagination = true,
  className,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  total?: number;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  caption?: ReactNode;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  showPagination?: boolean;
  className?: string;
}) {
  // Hook first, unconditionally. Calling useTranslation() after the `loading`
  // early-return below would make the hook order depend on the loading state,
  // which React forbids and which throws at runtime, not at build time.
  const { t } = useTranslation();

  // Showing the empty state while the first page is loading is the single most
  // common bug in a hand-rolled table: the user sees "no records" flash before
  // the rows arrive. Check loading FIRST.
  if (loading) return <DataTableSkeleton rows={5} cols={columns.length} />;

  if (!rows.length) {
    return (
      <div className={className}>
        <EmptyState
          // Table2 (lucide), not the `Table` primitive from ui/table — EmptyState
          // renders an svg icon, and the table primitive is a React component.
          icon={EmptyIcon ?? Table2}
          title={emptyTitle ?? t("hr.dataTable.emptyTitle")}
          description={emptyDescription ?? t("hr.dataTable.emptyDescription")}
          action={emptyAction}
        />
      </div>
    );
  }

  const interactive = typeof onRowClick === "function";

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <Table>
        {caption ? <TableCaption className="text-left">{caption}</TableCaption> : null}
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.headerClassName}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow
              key={i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={interactive ? "cursor-pointer" : undefined}
            >
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.render(row, i)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showPagination && onPageChange ? (
        <Pagination page={page} totalPages={totalPages} total={total} onChange={onPageChange} />
      ) : null}
    </div>
  );
}

/**
 * Toolbar row above a DataTable: a search box on the left, filters on the right.
 * Kept here rather than in each page so the spacing and wrapping behaviour match
 * across every module.
 */
export function DataTableToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
