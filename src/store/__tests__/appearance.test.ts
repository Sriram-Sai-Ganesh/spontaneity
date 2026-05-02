import {
  $appearance,
  resetAppearancePalette,
  setAppearance,
  setThemeSpecification,
} from "@/store/appearance";
import { DEFAULT_APPEARANCE } from "@/theme/appearance";

beforeEach(() => {
  setAppearance(DEFAULT_APPEARANCE);
});

describe("appearance store", () => {
  it("starts with the default appearance", () => {
    expect($appearance.get()).toEqual(DEFAULT_APPEARANCE);
  });

  it("persists a full appearance payload", () => {
    setAppearance({
      light: {
        colors: {
          primary: "#dde9f2",
          secondary: "#bdd0df",
          accent: "#4a759c",
        },
      },
      dark: {
        colors: {
          primary: "#101112",
          secondary: "#22262b",
          accent: "#8ea6c1",
        },
      },
    });

    expect($appearance.get().light.colors.primary).toBe("#dde9f2");
    expect(JSON.parse(localStorage.getItem("appearance") ?? "null")).toEqual(
      $appearance.get(),
    );
  });

  it("updates a single resolved theme specification", () => {
    setThemeSpecification("dark", {
      colors: {
        primary: "#151515",
        secondary: "#252525",
        accent: "#8a8a8a",
      },
      typography: {
        fontFamily: "IBM Plex Sans",
      },
    });

    expect($appearance.get().light).toEqual(DEFAULT_APPEARANCE.light);
    expect($appearance.get().dark).toEqual({
      colors: {
        primary: "#151515",
        secondary: "#252525",
        accent: "#8a8a8a",
      },
      typography: {
        fontFamily: "IBM Plex Sans",
      },
    });
  });

  it("resets saved colors to the default palette while preserving typography", () => {
    setAppearance({
      light: {
        colors: {
          primary: "#ccb59f",
          secondary: "#b59477",
          accent: "#7f5d46",
        },
        typography: {
          fontPreset: "space-grotesk",
        },
      },
      dark: {
        colors: {
          primary: "#2a221e",
          secondary: "#3f342e",
          accent: "#c2a089",
        },
        typography: {
          fontFamily: "IBM Plex Sans",
        },
      },
    });

    resetAppearancePalette();

    expect($appearance.get()).toEqual({
      light: {
        colors: DEFAULT_APPEARANCE.light.colors,
        typography: {
          fontPreset: "space-grotesk",
        },
      },
      dark: {
        colors: DEFAULT_APPEARANCE.dark.colors,
        typography: {
          fontFamily: "IBM Plex Sans",
        },
      },
    });
  });
});
