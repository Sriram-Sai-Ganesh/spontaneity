import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import ProfilePage from "../profile-page";

vi.mock("@/settings/hooks/use-query-settings", () => ({
  useQuerySettings: () => ({
    data: { displayName: "Alice", openRouterApiKey: "" },
  }),
}));

vi.mock("@/settings/hooks/use-mutation-settings", () => ({
  useMutationSettings: () => ({ edit: vi.fn() }),
}));

vi.mock("@/preferences/components/preferences-section", () => ({
  default: () => null,
}));

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUpdateProfile = vi.fn().mockResolvedValue(null);
const mockUpdateNotifPrefs = vi.fn().mockResolvedValue(null);
const mockSetHardRestrictions = vi.fn().mockResolvedValue(null);

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...(args as [unknown, unknown])),
  useMutation: (...args: unknown[]) => mockUseMutation(...(args as [unknown])),
  useConvexAuth: () => ({ isAuthenticated: true }),
}));

function renderProfile(options?: {
  user?: {
    name?: string;
    email?: string;
    image?: string;
    city?: string;
  };
  notifPrefs?: { emailNotificationsEnabled: boolean } | undefined;
}) {
  let queryCallCount = 0;
  mockUseQuery.mockImplementation(() => {
    queryCallCount += 1;
    // 1=me, 2=notifPrefs, 3=hardRestrictions
    if (queryCallCount % 3 === 1) {
      return options?.user ?? {
        name: "Rutva Pandya",
        email: "rutva@example.com",
        city: "Baltimore, MD",
      };
    }
    if (queryCallCount % 3 === 2) {
      return options?.notifPrefs;
    }
    return null;
  });

  let mutationCallCount = 0;
  mockUseMutation.mockImplementation(() => {
    mutationCallCount += 1;
    // 1=updateProfile, 2=updateNotifPrefs, 3=setHardRestrictions
    if (mutationCallCount % 3 === 1) return mockUpdateProfile;
    if (mutationCallCount % 3 === 2) return mockUpdateNotifPrefs;
    return mockSetHardRestrictions;
  });

  render(<ProfilePage />);
}

beforeEach(() => {
  mockUseQuery.mockReset();
  mockUseMutation.mockReset();
  mockUpdateProfile.mockReset();
  mockUpdateNotifPrefs.mockReset();
  mockSetHardRestrictions.mockReset();
  mockUpdateProfile.mockResolvedValue(null);
  mockUpdateNotifPrefs.mockResolvedValue(null);
  mockSetHardRestrictions.mockResolvedValue(null);
});

describe("ProfilePage", () => {
  it("renders checkbox checked when notifications are enabled", () => {
    renderProfile({ notifPrefs: { emailNotificationsEnabled: true } });

    expect(screen.getByLabelText("Receive email notifications")).toBeChecked();
  });

  it("renders checkbox unchecked when notifications are disabled", () => {
    renderProfile({ notifPrefs: { emailNotificationsEnabled: false } });

    expect(screen.getByLabelText("Receive email notifications")).not.toBeChecked();
  });

  it("defaults to checked when preference is not yet loaded", () => {
    renderProfile({ notifPrefs: undefined });

    expect(screen.getByLabelText("Receive email notifications")).toBeChecked();
  });

  it("calls updateNotificationPreferences with false when unchecked", async () => {
    const user = userEvent.setup();
    renderProfile({ notifPrefs: { emailNotificationsEnabled: true } });

    await user.click(screen.getByLabelText("Receive email notifications"));

    expect(mockUpdateNotifPrefs).toHaveBeenCalledWith({ emailNotificationsEnabled: false });
  });

  it("calls updateNotificationPreferences with true when re-checked", async () => {
    const user = userEvent.setup();
    renderProfile({ notifPrefs: { emailNotificationsEnabled: false } });

    await user.click(screen.getByLabelText("Receive email notifications"));

    expect(mockUpdateNotifPrefs).toHaveBeenCalledWith({ emailNotificationsEnabled: true });
  });

  it("saves the trimmed fallback city", async () => {
    const user = userEvent.setup();
    renderProfile();

    const cityInput = screen.getByLabelText(
      "Default fallback city when a group has no saved location",
    );

    await user.clear(cityInput);
    await user.type(cityInput, "  Chicago, IL  ");
    await user.click(screen.getByRole("button", { name: "Save city" }));

    expect(mockUpdateProfile).toHaveBeenCalledWith({ city: "Chicago, IL" });
  });
});
