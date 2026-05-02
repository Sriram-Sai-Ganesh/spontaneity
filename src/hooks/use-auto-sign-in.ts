import { useConvexAuth } from "convex/react";

/**
 * Returns the current authentication state.
 */
export function useAutoSignIn() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  return {
    isLoading,
    isAuthenticated,
  };
}
