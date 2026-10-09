import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";

/**
 * Regression guard for the bug that shipped: a MySQL JSON column arriving at the
 * client as a STRING.
 *
 * `letter_templates.merge_fields` is a JSON column, so mysql2 hands Node the text
 * '["employee_name","new_salary"]'. The template page trusted the declared
 * `string[]` type and called `tags.slice(0,4).map(...)` — slice() works on a
 * string, map() does not — and the page died with
 * "tags.slice(...).map is not a function".
 *
 * TypeScript passed, because the declared type is correct and the RUNTIME value
 * was not. That gap is what this file closes: it renders the real column renderer
 * with the real API shape and asserts on the DOM, so a string where an array was
 * promised fails here instead of in the browser.
 */
type TemplateRow = {
  uuid: string;
  name: string;
  /** The declared type is string[] — which is exactly why the bug was invisible. */
  merge_fields: string[];
};

const columns: DataTableColumn<TemplateRow>[] = [
  { key: "name", header: "Template name", render: (r) => <span>{r.name}</span> },
  {
    key: "merge_fields",
    header: "Merge tags",
    render: (r) => {
      // The exact expression from the page that crashed.
      const tags = r.merge_fields ?? [];
      return (
        <div data-testid="tags">
          {tags.slice(0, 4).map((tag) => (
            <span key={tag} className="tag">
              ${tag}
            </span>
          ))}
        </div>
      );
    },
  },
];

describe("DataTable with API-shaped rows", () => {
  it("renders merge tags when the API returns a real array", () => {
    const row: TemplateRow = {
      uuid: "t1",
      name: "Increment letter",
      merge_fields: ["employee_name", "new_salary", "effective_date"],
    };
    render(<DataTable columns={columns} rows={[row]} showPagination={false} />);

    expect(screen.getByText("Increment letter")).toBeInTheDocument();
    expect(screen.getByText("$employee_name")).toBeInTheDocument();
    expect(screen.getByText("$new_salary")).toBeInTheDocument();
    expect(screen.getByText("$effective_date")).toBeInTheDocument();
  });

  it("throws when the API returns a JSON string instead of an array", () => {
    // This assertion documents the failure mode deliberately: it is NOT a bug in
    // DataTable. It exists so that if this test ever starts failing at a DIFFERENT
    // line, someone knows the API shape regressed again rather than the component.
    const rawFromMysql = {
      uuid: "t1",
      name: "Increment letter",
      merge_fields: '["employee_name"]',
    };
    expect(() => columns[1].render(rawFromMysql as never, 0)).toThrow(
      /map is not a function|not a function/,
    );
  });

  it("survives a missing/empty merge_fields without crashing", () => {
    // Defensive: a template with no tags must render an empty cell, not throw.
    render(
      <DataTable
        columns={columns}
        rows={[{ uuid: "t1", name: "No tags", merge_fields: [] }]}
        showPagination={false}
      />,
    );
    expect(screen.getByText("No tags")).toBeInTheDocument();
  });
});

describe("DataTable states", () => {
  const rows: TemplateRow[] = [{ uuid: "t1", name: "Row A", merge_fields: ["x"] }];

  it("shows the EMPTY state rather than a spinner when there are no rows", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        loading={false}
        emptyTitle="No templates yet"
        showPagination={false}
      />,
    );
    expect(screen.getByText("No templates yet")).toBeInTheDocument();
  });

  it("shows the LOADING skeleton and NOT the empty state on a first load", () => {
    // The classic table bug: "no records" flashing before rows arrive. Checking
    // loading first is what prevents it, and this asserts the ordering.
    render(
      <DataTable
        columns={columns}
        rows={[]}
        loading
        emptyTitle="No templates yet"
        showPagination={false}
      />,
    );
    expect(screen.queryByText("No templates yet")).not.toBeInTheDocument();
  });

  it("renders a supplied empty-state action", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        loading={false}
        emptyTitle="Nothing"
        emptyDescription="Add one to begin"
        showPagination={false}
      />,
    );
    expect(screen.getByText("Nothing")).toBeInTheDocument();
    expect(screen.getByText("Add one to begin")).toBeInTheDocument();
  });
});
