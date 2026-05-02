import { $theme, setTheme, decodeTheme } from "../theme";

beforeEach(() => {
  $theme.set("system");
});

describe("theme store", () => {
  it("starts with default value", () => {
    expect($theme.get()).toBe("system");
  });

  it("setTheme updates to dark", () => {
    setTheme("dark");
    expect($theme.get()).toBe("dark");
  });

  it("setTheme updates to light", () => {
    setTheme("light");
    expect($theme.get()).toBe("light");
  });

  it("setTheme updates to random", () => {
    setTheme("random");
    expect($theme.get()).toBe("random");
  });

  it("setTheme updates back to system", () => {
    setTheme("dark");
    setTheme("system");
    expect($theme.get()).toBe("system");
  });

  describe("decodeTheme safety", () => {
    it("accepts 'dark'", () => {
      expect(decodeTheme("dark")).toBe("dark");
    });

    it("accepts 'light'", () => {
      expect(decodeTheme("light")).toBe("light");
    });

    it("accepts 'system'", () => {
      expect(decodeTheme("system")).toBe("system");
    });

    it("accepts 'random'", () => {
      expect(decodeTheme("random")).toBe("random");
    });

    it("returns 'system' for invalid string", () => {
      expect(decodeTheme("midnight")).toBe("system");
    });

    it("returns 'system' for number", () => {
      expect(decodeTheme(42)).toBe("system");
    });

    it("returns 'system' for null", () => {
      expect(decodeTheme(null)).toBe("system");
    });

    it("returns 'system' for undefined", () => {
      expect(decodeTheme(undefined)).toBe("system");
    });

    it("returns 'system' for object", () => {
      expect(decodeTheme({ theme: "dark" })).toBe("system");
    });
  });

  it("persistence roundtrip", () => {
    setTheme("dark");

    const stored = localStorage.getItem("theme");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toBe("dark");
  });
});
