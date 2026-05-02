import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { createTestConvex } from "./test.setup";

type FontPreset =
  | "roboto"
  | "manrope"
  | "space-grotesk"
  | "lora"
  | "ibm-plex-sans";

type FontSize = "small" | "medium" | "large";

type SavedTheme = {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  typography: {
    fontPreset: FontPreset;
    fontSize: FontSize;
    fontFamily?: string;
  };
};

const lightTheme: SavedTheme = {
  colors: {
    primary: "#f0f0f0",
    secondary: "#d9d9d9",
    accent: "#5e5e5e",
  },
  typography: {
    fontPreset: "roboto",
    fontSize: "medium",
  },
};

const darkTheme: SavedTheme = {
  colors: {
    primary: "#141414",
    secondary: "#232323",
    accent: "#b0b0b0",
  },
  typography: {
    fontPreset: "ibm-plex-sans",
    fontFamily: "IBM Plex Sans",
    fontSize: "large",
  },
};

const randomTheme: SavedTheme = {
  colors: {
    primary: "#c8e5ff",
    secondary: "#7bb4eb",
    accent: "#24548a",
  },
  typography: {
    fontPreset: "lora",
    fontSize: "small",
  },
};

describe("user appearance preferences", () => {
  it("returns null when a user has no saved appearance preferences", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "appearance-null@example.com",
      }),
    );

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_appearance_queries.getUserAppearancePreferences,
      {},
    );

    expect(result).toBeNull();
  });

  it("normalizes legacy appearance documents that still use colorScheme and fontPreset", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "appearance-legacy@example.com",
      }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("userAppearancePreferences", {
        userId,
        colorScheme: "system",
        fontPreset: "space-grotesk",
        updatedAt: 1775700360536,
      });
    });

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_appearance_queries.getUserAppearancePreferences,
      {},
    );

    expect(result).toEqual({
      mode: "system",
      themes: {
        light: {
          colors: {
            primary: "#f0f0f0",
            secondary: "#d9d9d9",
            accent: "#5e5e5e",
          },
          typography: {
            fontPreset: "space-grotesk",
            fontSize: "medium",
          },
        },
        dark: {
          colors: {
            primary: "#141414",
            secondary: "#232323",
            accent: "#b0b0b0",
          },
          typography: {
            fontPreset: "space-grotesk",
            fontSize: "medium",
          },
        },
      },
    });
  });

  it("saves and returns theme mode, typography, and random theme specifications for a user", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "appearance-save@example.com",
      }),
    );

    await t.withIdentity({ subject: userId }).mutation(
      api.user_appearance_mutations.setUserAppearancePreferences,
      {
        mode: "random",
        themes: {
          light: lightTheme,
          dark: darkTheme,
          random: randomTheme,
        },
      },
    );

    const result = await t.withIdentity({ subject: userId }).query(
      api.user_appearance_queries.getUserAppearancePreferences,
      {},
    );

    expect(result).toEqual({
      mode: "random",
      themes: {
        light: lightTheme,
        dark: darkTheme,
        random: randomTheme,
      },
    });
  });

  it("updates an existing appearance document instead of inserting a duplicate", async () => {
    const t = createTestConvex();

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "appearance-update@example.com",
      }),
    );

    await t.withIdentity({ subject: userId }).mutation(
      api.user_appearance_mutations.setUserAppearancePreferences,
      {
        mode: "light",
        themes: {
          light: lightTheme,
          dark: darkTheme,
        },
      },
    );

    await t.withIdentity({ subject: userId }).mutation(
      api.user_appearance_mutations.setUserAppearancePreferences,
      {
        mode: "system",
        themes: {
          light: {
            colors: {
              primary: "#dde9f2",
              secondary: "#bdd0df",
              accent: "#4a759c",
            },
            typography: {
              fontPreset: "manrope",
              fontSize: "large",
            },
          },
          dark: darkTheme,
        },
      },
    );

    const savedRows = await t.run(async (ctx) =>
      ctx.db
        .query("userAppearancePreferences")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect(),
    );

    expect(savedRows).toHaveLength(1);
    const savedRow = savedRows[0];
    expect(savedRow).toBeDefined();
    expect(savedRow?.mode).toBe("system");
    expect(savedRow?.themes?.light.colors).toEqual({
      primary: "#dde9f2",
      secondary: "#bdd0df",
      accent: "#4a759c",
    });
    expect(savedRow?.themes?.light.typography).toEqual({
      fontPreset: "manrope",
      fontSize: "large",
    });
  });

  it("stores appearance preferences independently for each user", async () => {
    const t = createTestConvex();

    const firstUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "appearance-user-1@example.com",
      }),
    );
    const secondUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "appearance-user-2@example.com",
      }),
    );

    await t.withIdentity({ subject: firstUserId }).mutation(
      api.user_appearance_mutations.setUserAppearancePreferences,
      {
        mode: "light",
        themes: {
          light: lightTheme,
          dark: darkTheme,
        },
      },
    );

    await t.withIdentity({ subject: secondUserId }).mutation(
      api.user_appearance_mutations.setUserAppearancePreferences,
      {
        mode: "dark",
        themes: {
          light: {
            colors: {
              primary: "#f0f0f0",
              secondary: "#dedede",
              accent: "#747474",
            },
            typography: {
              fontPreset: "manrope",
              fontSize: "medium",
            },
          },
          dark: {
            colors: {
              primary: "#101010",
              secondary: "#242424",
              accent: "#8c8c8c",
            },
            typography: {
              fontPreset: "space-grotesk",
              fontSize: "small",
            },
          },
        },
      },
    );

    const firstUserResult = await t.withIdentity({ subject: firstUserId }).query(
      api.user_appearance_queries.getUserAppearancePreferences,
      {},
    );
    const secondUserResult = await t.withIdentity({
      subject: secondUserId,
    }).query(api.user_appearance_queries.getUserAppearancePreferences, {});

    expect(firstUserResult?.mode).toBe("light");
    expect(secondUserResult?.mode).toBe("dark");
    expect(firstUserResult?.themes.light.colors.primary).toBe("#f0f0f0");
    expect(secondUserResult?.themes.light.colors.primary).toBe("#f0f0f0");
    expect(firstUserResult?.themes.dark.typography?.fontSize).toBe("large");
    expect(secondUserResult?.themes.dark.typography?.fontPreset).toBe(
      "space-grotesk",
    );
  });
});
