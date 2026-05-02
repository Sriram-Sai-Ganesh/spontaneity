import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { createTestConvex, createTestUser } from "./test.setup";

describe("users profile city", () => {
  test("returns the saved city from me", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);

    await t.withIdentity(identity).mutation(api.users_mutations.updateMyProfile, {
      city: "Chicago, IL",
    });

    await expect(
      t.withIdentity(identity).query(api.users_queries.me, {}),
    ).resolves.toMatchObject({
      city: "Chicago, IL",
    });
  });

  test("clears the saved city when null is submitted", async () => {
    const t = createTestConvex();
    const { identity } = await createTestUser(t);

    await t.withIdentity(identity).mutation(api.users_mutations.updateMyProfile, {
      city: "Boston, MA",
    });
    await t.withIdentity(identity).mutation(api.users_mutations.updateMyProfile, {
      city: null,
    });

    const me = await t.withIdentity(identity).query(api.users_queries.me, {});
    expect(me?._id).toBeDefined();
    expect(me).not.toHaveProperty("city");
  });
});
