import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import FreeformPreferencesDialog from "../freeform-preferences-dialog";

const mockUpdateProfile = vi.fn().mockResolvedValue(null);
const mockSetPreferences = vi.fn().mockResolvedValue(null);
const mockClassifyPreferences = vi.fn();
const mockUseMutation = vi.fn();
const mockUseAction = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...(args as [unknown])),
  useAction: (...args: unknown[]) => mockUseAction(...(args as [unknown])),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: unknown }) => <div>{children}</div>,
  DialogContent: ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: unknown }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: unknown }) => <h2>{children}</h2>,
  DialogDescription: ({ children, ...props }: Record<string, unknown>) => (
    <p {...props}>{children}</p>
  ),
  DialogFooter: ({ children }: { children: unknown }) => <div>{children}</div>,
}));

beforeEach(() => {
  mockUpdateProfile.mockReset();
  mockSetPreferences.mockReset();
  mockClassifyPreferences.mockReset();
  mockUseMutation.mockReset();
  mockUseAction.mockReset();

  mockUpdateProfile.mockResolvedValue(null);
  mockSetPreferences.mockResolvedValue(null);
  let mutationCallCount = 0;
  mockUseMutation.mockImplementation(() => {
    mutationCallCount += 1;
    return mutationCallCount % 2 === 1
      ? mockUpdateProfile
      : mockSetPreferences;
  });
  mockUseAction.mockReturnValue(mockClassifyPreferences);
});

describe("FreeformPreferencesDialog", () => {
  it("requires a city before onboarding can continue", () => {
    render(<FreeformPreferencesDialog open onComplete={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Continue →" })).toBeDisabled();
  });

  it("prompts for city first and saves it before moving to preferences", async () => {
    const user = userEvent.setup();

    render(<FreeformPreferencesDialog open onComplete={vi.fn()} />);

    expect(screen.getByLabelText("City")).toBeInTheDocument();

    await user.type(screen.getByLabelText("City"), "  Chicago, IL  ");
    await user.click(screen.getByRole("button", { name: "Continue →" }));

    expect(mockUpdateProfile).toHaveBeenCalledWith({ city: "Chicago, IL" });
    expect(
      screen.getByText(/What types of events or activities do you enjoy/i),
    ).toBeInTheDocument();
  });
});
