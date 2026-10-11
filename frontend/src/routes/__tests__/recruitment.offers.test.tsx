import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OffersPage } from "@/routes/_app.org.recruitment.offers";
import type { Offer } from "@/services";

const mock = vi.hoisted(() => ({
  list: vi.fn(),
  send: vi.fn(),
  hire: vi.fn(),
}));

vi.mock("@/services", async () => {
  const actual = await vi.importActual<typeof import("@/services")>("@/services");
  return { ...actual, offersService: { ...actual.offersService, ...mock } };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useLocation: () => ({ pathname: "/org/recruitment/offers" }),
  createFileRoute: () => () => null,
}));

const offer: Offer = {
  candidate_uuid: "candidate-1",
  full_name: "Ayesha Siddiqui",
  email: "ayesha@example.com",
  stage: "selected",
  opening_title: "Senior Accountant",
  reference_no: "OFR-123",
  letter_status: null,
  letter_title: null,
  offer_letter_uuid: null,
  converted_employee_uuid: null,
  hired_at: null,
  offer_status: "ready",
  offer_sent_at: null,
  offer_response_at: null,
  issued_at: null,
  qr_token: null,
  verify_url: null,
  offer_body_snapshot: "Offer terms",
};

function renderPage(row: Offer) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <OffersPage />
    </QueryClientProvider>,
  );
  return row;
}

describe("recruitment offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.list.mockImplementation(async () => ({
      items: [offer],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    }));
    mock.send.mockResolvedValue({ status: "sent" });
    mock.hire.mockResolvedValue({ employee_uuid: "employee-1" });
  });

  it("sends a ready offer directly to the candidate", async () => {
    const user = userEvent.setup();
    renderPage(offer);

    await user.click(await screen.findByRole("button", { name: /view offer/i }));
    const sendAction = await screen.findByRole("button", { name: /send offer letter/i });
    await user.click(sendAction);

    await waitFor(() => expect(mock.send).toHaveBeenCalledWith("candidate-1"));
  });

  it("marks a sent offer hired and does not show a decline action", async () => {
    const user = userEvent.setup();
    const sentOffer = { ...offer, offer_status: "sent" as const };
    mock.list.mockResolvedValue({ items: [sentOffer], total: 1, page: 1, limit: 20, totalPages: 1 });
    renderPage(sentOffer);

    await user.click(await screen.findByRole("button", { name: /view offer/i }));
    await user.click(await screen.findByRole("button", { name: /^hired$/i }));

    await waitFor(() => expect(mock.hire).toHaveBeenCalledWith("candidate-1"));
    expect(screen.queryByRole("button", { name: /decline|accept/i })).not.toBeInTheDocument();
  });
});
