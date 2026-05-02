import { useAuthToken as useConvexAuthToken } from "@convex-dev/auth/react";

/**
 * Returns the current JWT token for authenticating HTTP requests to Convex.
 * Returns null if not authenticated.
 */
export function useAuthToken(): string | null {
  return useConvexAuthToken();
}
