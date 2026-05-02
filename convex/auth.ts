import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Anonymous,
    Google({
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
        },
      },
      // Capture OAuth tokens in the profile so they are persisted to the
      // users table (which has been extended with googleAccessToken etc.).
      // The `id` field is stripped by @convex-dev/auth and used as the
      // providerAccountId; the rest is spread into the user document.
      profile(profile, tokens) {
        return {
          id: profile.sub as string,
          name: profile.name as string | undefined,
          email: profile.email as string | undefined,
          emailVerified: (profile as Record<string, unknown>)
            .email_verified as boolean | undefined,
          image: (profile as Record<string, unknown>).picture as
            | string
            | undefined,
          googleAccessToken: tokens.access_token,
          // Only include refresh_token when Google provides one (first sign-in
          // or when access was explicitly re-granted). Omitting it on
          // subsequent sign-ins preserves the previously stored refresh token.
          ...(tokens.refresh_token
            ? { googleRefreshToken: tokens.refresh_token }
            : {}),
          googleTokenExpiry: tokens.expires_at,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      },
    }),
  ],
});
