import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IssuesPanel, type Issue } from "./issues-panel";
import { resolveIssue } from "./actions";

vi.mock("./actions", () => ({
  resolveIssue: vi.fn(async () => {}),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

function issueFixture(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "i1",
    subjectType: "room",
    subjectId: "r1",
    subjectLabel: "Room 101",
    reporterName: "Ada",
    description: "Broken light",
    department: "Facilities",
    status: "open",
    createdAt: new Date(Date.now() - DAY_MS).toISOString(),
    ...overrides,
  };
}

const issues: Issue[] = [
  issueFixture({
    id: "i1",
    description: "Broken light",
    department: "Facilities",
    subjectType: "room",
    subjectId: "r1",
    subjectLabel: "Room 101",
  }),
  issueFixture({
    id: "i2",
    description: "Router down",
    department: "IT",
    subjectType: "equipment",
    subjectId: "e1",
    subjectLabel: "Router",
  }),
  issueFixture({
    id: "i3",
    description: "Old spill",
    department: "Safety",
    status: "resolved",
    subjectType: "area",
    subjectId: "a1",
    subjectLabel: "Walkway",
  }),
];

function renderPanel(overrides: Partial<Parameters<typeof IssuesPanel>[0]> = {}) {
  const onFocusSubject = vi.fn();
  render(
    <IssuesPanel
      floorId="floor-1"
      issues={issues}
      onFocusSubject={onFocusSubject}
      {...overrides}
    />,
  );
  return { onFocusSubject };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("IssuesPanel", () => {
  it("renders nothing when there are no Issues", () => {
    const { container } = render(<IssuesPanel floorId="floor-1" issues={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hides resolved Issues by default and reveals them via the toggle", () => {
    renderPanel();
    expect(screen.getByText("Broken light")).toBeInTheDocument();
    expect(screen.queryByText("Old spill")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show resolved" }));
    expect(screen.getByText("Old spill")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide resolved" }));
    expect(screen.queryByText("Old spill")).not.toBeInTheDocument();
  });

  it("filters cards by Department chip and restores with All", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /^IT/ }));
    expect(screen.getByText("Router down")).toBeInTheDocument();
    expect(screen.queryByText("Broken light")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getByText("Broken light")).toBeInTheDocument();
    expect(screen.getByText("Router down")).toBeInTheDocument();
  });

  it("only offers chips for Departments present in the issue set", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /^Operations/ })).not.toBeInTheDocument();
  });

  it("groups cards under Department headings in Department sort", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Department" }));
    expect(screen.getByRole("heading", { name: /IT \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Facilities \(1\)/ })).toBeInTheDocument();
  });

  it("resolves an Issue via its Resolve button", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Resolve: Router down" }));
    await waitFor(() => expect(resolveIssue).toHaveBeenCalledWith("floor-1", "i2"));
  });

  it("does not offer Resolve on resolved Issues", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Show resolved" }));
    expect(
      screen.queryByRole("button", { name: "Resolve: Old spill" }),
    ).not.toBeInTheDocument();
  });

  it("invokes onFocusSubject with the subject ref when a card body is clicked", () => {
    const { onFocusSubject } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Locate Router on the Floor Plan" }));
    expect(onFocusSubject).toHaveBeenCalledWith({ type: "equipment", id: "e1" });
  });

  it("clicking a card body does not resolve the Issue", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Locate Room 101 on the Floor Plan" }));
    expect(resolveIssue).not.toHaveBeenCalled();
  });

  it("shows the all-resolved state when every Issue is resolved", () => {
    renderPanel({ issues: [issueFixture({ status: "resolved" })] });
    expect(screen.getByText(/All Issues resolved \(1 total\)/)).toBeInTheDocument();
  });
});
