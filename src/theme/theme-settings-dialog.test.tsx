import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import ThemeSettingsDialog from "./theme-settings-dialog";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_DARK_COLORS,
  DEFAULT_LIGHT_COLORS,
  FONT_PRESET_OPTIONS,
} from "@/theme/appearance";

const mockSetAppearance = vi.fn();
const mockSetTheme = vi.fn();
const mockGenerateRandomPalette = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("convex/react", () => ({
  useAction: () => mockGenerateRandomPalette,
}));

vi.mock("@/hooks/use-appearance", () => ({
  useAppearance: () => ({
    appearance: DEFAULT_APPEARANCE,
    setAppearance: mockSetAppearance,
  }),
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme: mockSetTheme,
  }),
}));

describe("ThemeSettingsDialog", () => {
  beforeEach(() => {
    mockSetAppearance.mockReset();
    mockSetTheme.mockReset();
    mockGenerateRandomPalette.mockReset();
  });

  it("renders the compact theme controls and preview content", () => {
    render(<ThemeSettingsDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Friday night shortlist")).toBeInTheDocument();
    expect(screen.getByText("Late Night Jazz")).toBeInTheDocument();
    expect(screen.getByText("Museum After Hours")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dark" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Random.*New/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Small.*15px/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Default.*16px/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Large.*18px/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Roboto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "IBM Plex Sans" })).toBeInTheDocument();
  });

  it("saves the selected theme mode and typography across the fixed palettes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<ThemeSettingsDialog open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "Dark" }));
    await user.click(screen.getByRole("button", { name: /Large.*18px/i }));
    await user.click(screen.getByRole("button", { name: "Manrope" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const manropeFamily = FONT_PRESET_OPTIONS.find(
      (option) => option.id === "manrope",
    )?.family;

    expect(mockSetAppearance).toHaveBeenCalledWith({
      light: {
        colors: DEFAULT_LIGHT_COLORS,
        typography: {
          fontPreset: "manrope",
          fontSize: "large",
          fontFamily: manropeFamily,
        },
      },
      dark: {
        colors: DEFAULT_DARK_COLORS,
        typography: {
          fontPreset: "manrope",
          fontSize: "large",
          fontFamily: manropeFamily,
        },
      },
    });
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
