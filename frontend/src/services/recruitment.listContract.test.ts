import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * THE LIST-RESPONSE CONTRACT, ASSERTED AT THE SEAM THE CALLERS USE.
 *
 * All four recruitment list endpoints — candidates, offers, openings, interviews —
 * resolve to the SAME envelope from the server's `paginatedResponse()`:
 *
 *     { items, total, page, totalPages }
 *
 * Openings and interviews were the two that did not; they returned a bare
 * `{ items, total }` with no page or totalPages, which is what made this module have
 * two shapes behind one route prefix and left the openings table unable to render the
 * pager the candidates table already has.
 *
 * The client splits that envelope two ways, and BOTH are pinned here:
 *
 *   - `list` resolves to the ARRAY, for the callers that only want rows.
 *   - `listPaginated` resolves to the ENVELOPE, for the ones that need a total.
 *
 * The array case is the one worth asserting hard. A caller handed a `Paginated`
 * object where it wanted rows does not fail where the change was made — it fails
 * later, at `.map`, somewhere else entirely. Mocking axios directly rather than
 * mocking the services keeps this at the seam where the unwrapping actually happens.
 */

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();

vi.mock("@/lib/api", () => ({
  api: { get, post, put },
  // `Paginated` is a type-only import in the module under test; the mock supplies it
  // anyway so a future value import cannot silently become undefined.
  Paginated: class {},
}));

const OPENING_ROW = {
  uuid: "op-1",
  title: "Senior Accountant",
  status: "open",
  vacancies: 2,
  candidate_count: 3,
  hired_count: 1,
  vacancies_remaining: 1,
  created_at: "2026-01-01T00:00:00Z",
};

const INTERVIEW_ROW = {
  uuid: "i-1",
  candidate_uuid: "c-1",
  candidate_name: "Ayesha Siddiqui",
  scheduled_at: "2026-06-01T10:00:00Z",
  status: "scheduled",
  outcome: "pending",
  created_at: "2026-05-20T00:00:00Z",
};

/** The exact envelope `paginatedResponse(items, total, page, limit)` emits. */
const envelope = (items: unknown[], total = items.length, page = 1, limit = 20) => ({
  items,
  total,
  page,
  totalPages: Math.ceil(total / limit),
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function services() {
  return await import("./recruitment");
}

describe("recruitment list-response contract", () => {
  it("jobOpeningsService.list resolves to an ARRAY, not the envelope", async () => {
    get.mockResolvedValue({ data: envelope([OPENING_ROW]) });
    const { jobOpeningsService } = await services();

    const rows = await jobOpeningsService.list();

    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0].title).toBe("Senior Accountant");
  });

  it("jobOpeningsService.listPaginated resolves to the four-field envelope", async () => {
    get.mockResolvedValue({ data: envelope([OPENING_ROW], 41, 2, 20) });
    const { jobOpeningsService } = await services();

    const result = await jobOpeningsService.listPaginated({ page: 2 });

    expect(Array.isArray(result)).toBe(false);
    expect(Object.keys(result).sort()).toEqual(["items", "page", "total", "totalPages"]);
    expect(result.total).toBe(41);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(3);
  });

  it("interviewsService.list resolves to an ARRAY of rows", async () => {
    get.mockResolvedValue({ data: envelope([INTERVIEW_ROW]) });
    const { interviewsService } = await services();

    const rows = await interviewsService.list();

    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0].candidate_name).toBe("Ayesha Siddiqui");
  });

  it("interviewsService.listPaginated resolves to the same four-field envelope", async () => {
    get.mockResolvedValue({ data: envelope([INTERVIEW_ROW], 5) });
    const { interviewsService } = await services();

    const result = await interviewsService.listPaginated();

    expect(Object.keys(result).sort()).toEqual(["items", "page", "total", "totalPages"]);
  });

  it("ALL FOUR list endpoints return identical field names", async () => {
    get.mockResolvedValue({ data: envelope([OPENING_ROW]) });
    const { jobOpeningsService, candidatesService, offersService, interviewsService } =
      await services();

    // Resolved values, not response shapes: `candidatesService.list` and
    // `offersService.list` return the envelope directly (they always did), while
    // openings and interviews unwrap through `list`. What has to match is the set of
    // fields a caller can rely on for the paged form of each.
    const openings = await jobOpeningsService.listPaginated();
    const candidates = await candidatesService.list();
    const offers = await offersService.list();
    const interviews = await interviewsService.listPaginated();

    const shape = (r: object) => Object.keys(r).sort().join(",");
    expect(shape(openings)).toBe("items,page,total,totalPages");
    expect(shape(candidates)).toBe(shape(openings));
    expect(shape(offers)).toBe(shape(openings));
    expect(shape(interviews)).toBe(shape(openings));
  });

  it("bounds the interviews request so a year of history cannot be fetched at once", async () => {
    // The regression the pagination change exists to prevent: an org with a year of
    // COMPLETED interviews fetching every one of them to show today's meeting.
    get.mockResolvedValue({ data: envelope([INTERVIEW_ROW]) });
    const { interviewsService } = await services();

    await interviewsService.list();

    // 100 is the server's maxLimit, so this reads as "as much as allowed" rather than
    // asking for more than will be granted and silently receiving less.
    expect(get).toHaveBeenCalledWith("/org/interviews", {
      params: expect.objectContaining({ limit: 100 }),
    });
  });

  it("does NOT send an empty `values` object, which would blank the letter", async () => {
    // The reported bug. `send(uuid)` used to post `{ values: {} }`, and that empty object
    // MERGED over the merge fields the hire had already stored on the draft letter — so
    // the issued PDF rendered `{{salary}}` as a literal placeholder because the send
    // erased what the hire had filled in.
    //
    // The fix is to omit the key entirely: axios then sends no `values` at all and the
    // server keeps its own. Asserted on the exact request body rather than on the
    // response, because the damage is in what was sent.
    post.mockResolvedValue({
      data: { letter: { uuid: "l-1", reference_no: "DVR-1", status: "issued" } },
    });
    const { offersService } = await services();

    await offersService.send("c-1");

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0];
    expect(url).toBe("/org/offers/c-1/send");
    expect(body).not.toHaveProperty("values");
    expect(body, "an empty values object merges over the letter").toEqual({});
  });

  it("does not allow send-time values to replace approved offer terms", async () => {
    post.mockResolvedValue({ data: { candidate_uuid: "c-1", status: "sent" } });
    const { offersService } = await services();

    await offersService.send("c-1");

    expect(post.mock.calls[0][1]).toEqual({});
  });

  it("forwards page and limit when a caller supplies them", async () => {
    get.mockResolvedValue({ data: envelope([OPENING_ROW], 41, 3, 10) });
    const { jobOpeningsService } = await services();

    await jobOpeningsService.listPaginated({ page: 3, limit: 10 });

    expect(get).toHaveBeenCalledWith("/org/job-openings", {
      params: expect.objectContaining({ page: 3, limit: 10 }),
    });
  });

  it("forwards the status filter, and omits it rather than sending an empty string", async () => {
    get.mockResolvedValue({ data: envelope([OPENING_ROW]) });
    const { jobOpeningsService } = await services();

    await jobOpeningsService.list("open");
    expect(get).toHaveBeenLastCalledWith("/org/job-openings", {
      params: expect.objectContaining({ status: "open" }),
    });

    // `status: ""` would be filtered server-side as truthy-checked and match nothing.
    await jobOpeningsService.list();
    const params = get.mock.calls.at(-1)?.[1]?.params;
    expect(params.status).toBeUndefined();
  });
});
