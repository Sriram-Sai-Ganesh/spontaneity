import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import ChatList from "../chat-list";
import { createTestChat } from "@/test/helpers";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/", mockSetLocation],
}));

vi.mock("@/layout/sidebar-context", () => ({
  useSidebar: () => ({ closeSidebar: vi.fn() }),
}));

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn(() => vi.fn().mockResolvedValue(null));
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...(args as [unknown])),
  useMutation: () => mockUseMutation(),
  useAction: () => vi.fn(),
}));

beforeEach(() => {
  mockUseQuery.mockReset();
  mockUseMutation.mockReset();
  mockUseMutation.mockReturnValue(vi.fn().mockResolvedValue(null));
});

describe("ChatList", () => {
  it("renders loading state while provisioning the assistant chat", () => {
    mockUseQuery.mockReturnValue([]);

    render(<ChatList />);

    expect(screen.getByText("Loading groups...")).toBeInTheDocument();
  });

  it("renders chat titles", () => {
    const now = Date.now();
    mockUseQuery.mockReturnValue([
      createTestChat({
        _id: "ai",
        title: "Spontaneity AI",
        _creationTime: now - 5000,
        kind: "ai",
      }),
      createTestChat({ _id: "c1", title: "First Chat", _creationTime: now }),
      createTestChat({
        _id: "c2",
        title: "Second Chat",
        _creationTime: now - 1000,
      }),
    ]);

    render(<ChatList />);

    expect(screen.getByText("Spontaneity AI")).toBeInTheDocument();
    expect(screen.getByText("First Chat")).toBeInTheDocument();
    expect(screen.getByText("Second Chat")).toBeInTheDocument();
  });

  it("pins Spontaneity AI above regular groups", () => {
    const now = Date.now();
    mockUseQuery.mockReturnValue([
      createTestChat({ _id: "c1", title: "First Chat", _creationTime: now }),
      createTestChat({
        _id: "ai",
        title: "Spontaneity AI",
        _creationTime: now - 100000,
        kind: "ai",
      }),
    ]);

    render(<ChatList />);

    const aiTitle = screen.getByText("Spontaneity AI");
    const groupTitle = screen.getByText("First Chat");
    expect(
      aiTitle.compareDocumentPosition(groupTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("search filters chats by title", () => {
    const now = Date.now();
    mockUseQuery.mockReturnValue([
      createTestChat({
        _id: "ai",
        title: "Spontaneity AI",
        _creationTime: now - 5000,
        kind: "ai",
      }),
      createTestChat({ _id: "c1", title: "React Help", _creationTime: now }),
      createTestChat({
        _id: "c2",
        title: "Python Tips",
        _creationTime: now - 1000,
      }),
    ]);

    render(<ChatList searchQuery="React" />);

    expect(screen.getByText("React Help")).toBeInTheDocument();
    expect(screen.queryByText("Python Tips")).not.toBeInTheDocument();
  });
});
