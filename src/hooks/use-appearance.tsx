import {
  $appearance,
  resetAppearancePalette,
  setAppearance,
  setThemeSpecification,
} from "@/store/appearance";
import { useSelector } from "@legendapp/state/react";

export const useAppearance = () => {
  const appearance = useSelector($appearance);

  return {
    appearance,
    resetAppearancePalette,
    setAppearance,
    setThemeSpecification,
  };
};
