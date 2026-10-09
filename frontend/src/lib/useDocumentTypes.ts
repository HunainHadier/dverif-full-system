import { useQuery } from "@tanstack/react-query";

import { documentTypeService } from "@/services";
import { EMPLOYEE_DOCUMENT_TYPES, EMPLOYEE_DOCUMENT_TYPE_OPTIONS } from "./documentTypes";

/**
 * The active document-type catalogue, from the API.
 *
 * The catalogue is data now (a `document_types` table a system admin edits) rather
 * than the hard-coded array below, so a type added in the admin panel shows up
 * here without a frontend deploy.
 *
 * The static list is kept as a FALLBACK and as the offline/never-loaded value,
 * for one reason: this list drives the document-type dropdown on the request
 * form and the employee reference upload. If the API call fails, an empty
 * dropdown would block an organization from submitting anything at all — a
 * degraded but usable form is much better than a hard outage. The server does
 * NOT accept an arbitrary document_type either, so a stale fallback cannot cause
 * a type to be accepted that the catalogue has removed.
 */
export function useDocumentTypes() {
  const query = useQuery({
    queryKey: ["document-types"],
    queryFn: () => documentTypeService.list(),
    // The catalogue changes rarely and only from the admin panel, so a long
    // staleTime keeps this off the request path for ordinary form use.
    staleTime: 5 * 60 * 1000,
  });

  // The built-in fallback carries no schema_key (it predates the database
  // catalogue), so it is widened to match. Only `value`/`label` are read by the
  // two dropdowns that consume this; schema_key is informational here.
  const items: { value: string; label: string; schema_key?: string }[] =
    query.data && query.data.length > 0 ? query.data : EMPLOYEE_DOCUMENT_TYPE_OPTIONS;

  return {
    items,
    labels: items.map((i) => i.value),
    isLoading: query.isLoading,
    /** True when the API failed and the built-in list is standing in. */
    isFallback: !query.data || query.data.length === 0,
  };
}

/** Just the label strings, for the one caller that does not need options. */
export function useDocumentTypeLabels(): string[] {
  const { labels } = useDocumentTypes();
  return labels;
}

export { EMPLOYEE_DOCUMENT_TYPES, EMPLOYEE_DOCUMENT_TYPE_OPTIONS };
