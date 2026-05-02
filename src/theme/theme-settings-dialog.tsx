import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useAction } from "convex/react";
import {
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Sun,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppearance } from "@/hooks/use-appearance";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import {
  FONT_PRESET_OPTIONS,
  FONT_SIZE_OPTIONS,
  buildThemeVariables,
  createThemeSpecification,
  getAppearanceTypography,
  getThemeSpecificationForMode,
  replaceAppearanceColorsWithDefaults,
  resolveThemeMode,
  resolveThemeTypography,
  setAppearanceTypography,
} from "@/theme/appearance";
import type { Appearance, FontPreset, FontSize, Theme } from "@/types/theme";
import { api } from "../../convex/_generated/api";

type ThemeSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const COLOR_SCHEME_OPTIONS: Array<{
  id: Theme;
  label: string;
  icon: typeof Monitor;
}> = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "random", label: "Random", icon: Palette },
];

function ThemeSelectorRow({
  active,
  label,
  meta,
  onSelect,
  icon: Icon,
  trailing,
  style,
}: {
  active: boolean;
  label: string;
  meta?: string;
  onSelect: () => void;
  icon?: typeof Monitor;
  trailing?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        active
          ? "border-primary/40 bg-primary/10 shadow-sm"
          : "border-border/70 bg-background hover:border-primary/25 hover:bg-muted/60",
      )}
      style={style}
    >
      <span className="flex min-w-0 items-center gap-3">
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          {meta ? (
            <span className="block text-xs text-muted-foreground">{meta}</span>
          ) : null}
        </span>
      </span>
      <span className="flex items-center gap-2">
        {trailing}
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full border",
            active ? "border-primary bg-primary" : "border-border bg-background",
          )}
        />
      </span>
    </div>
  );
}

function ThemePreview({
  appearance,
  theme,
}: {
  appearance: Appearance;
  theme: Theme;
}) {
  const specification = getThemeSpecificationForMode(theme, appearance);
  const resolvedTheme = resolveThemeMode(theme, appearance);
  const previewVariables = buildThemeVariables(specification, resolvedTheme);
  const typography = resolveThemeTypography(specification.typography);
  const previewStyle = previewVariables as CSSProperties;

  return (
    <div
      className="rounded-[32px] border border-app-border-strong/60 bg-app-shell p-6 shadow-sm lg:p-7"
      style={{
        ...previewStyle,
        colorScheme: resolvedTheme,
        fontFamily: typography.fontFamily,
        fontSize: typography.fontSize === "small"
          ? "15px"
          : typography.fontSize === "large"
            ? "18px"
            : "16px",
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-app-border-strong/60 bg-card px-4 py-3 text-card-foreground shadow-sm">
        <div>
          <p style={{ fontSize: "0.72em" }} className="uppercase tracking-[0.18em] text-muted-foreground">
            Group Planning
          </p>
          <h3 style={{ fontSize: "1.1em" }} className="font-semibold text-card-foreground">
            Friday night shortlist
          </h3>
        </div>
        <span className="rounded-full bg-primary px-3 py-1 text-[0.72em] font-medium text-primary-foreground">
          Active
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-2xl border border-app-border-strong/60 bg-card p-4 text-card-foreground shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p style={{ fontSize: "1em" }} className="font-semibold text-card-foreground">
                Late Night Jazz
              </p>
              <p style={{ fontSize: "0.78em" }} className="text-muted-foreground">
                Fri, Apr 10 · 8:00 PM
              </p>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.7em] font-medium text-secondary-foreground">
              Ticketmaster
            </span>
          </div>
          <p style={{ fontSize: "0.8em" }} className="text-muted-foreground">
            Keystone Lounge, Baltimore
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-accent px-2.5 py-1 text-[0.72em] font-medium text-accent-foreground">
              Everyone available
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.72em] font-medium text-secondary-foreground">
              Moderate
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-primary px-3 py-1.5 text-[0.78em] font-medium text-primary-foreground"
            >
              Hold spot
            </button>
            <button
              type="button"
              className="rounded-full border border-app-border-strong/60 bg-card px-3 py-1.5 text-[0.78em] font-medium text-card-foreground"
            >
              View details
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-app-border-strong/60 bg-app-panel p-4 text-foreground shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p style={{ fontSize: "1em" }} className="font-semibold text-foreground">
                Museum After Hours
              </p>
              <p style={{ fontSize: "0.78em" }} className="text-muted-foreground">
                Sat, Apr 11 · 7:30 PM
              </p>
            </div>
            <span className="rounded-full bg-status-success/15 px-2.5 py-1 text-[0.7em] font-medium text-foreground">
              Best fit
            </span>
          </div>
          <p style={{ fontSize: "0.8em" }} className="text-muted-foreground">
            Walters Art Museum, Baltimore
          </p>
          <div className="mt-3 rounded-2xl bg-app-panel-accent p-3 text-accent-foreground">
            <p style={{ fontSize: "0.74em" }} className="uppercase tracking-[0.16em] opacity-80">
              Why it works
            </p>
            <p style={{ fontSize: "0.82em" }} className="mt-1 font-medium">
              Walkable venue, broad appeal, and fits the shared evening window.
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}

function buildDraftAppearance(appearance: Appearance) {
  return setAppearanceTypography(
    replaceAppearanceColorsWithDefaults(appearance),
    getAppearanceTypography(appearance),
  );
}

function getThemeLabel(theme: Theme) {
  return COLOR_SCHEME_OPTIONS.find((option) => option.id === theme)?.label ?? "System";
}

export default function ThemeSettingsDialog({
  open,
  onOpenChange,
}: ThemeSettingsDialogProps) {
  const { appearance, setAppearance } = useAppearance();
  const { theme, setTheme } = useTheme();
  const generateRandomPalette = useAction(
    api.user_appearance_actions.generateRandomAppearancePalette,
  );
  const [draftTheme, setDraftTheme] = useState<Theme>(theme);
  const [draftAppearance, setDraftAppearance] = useState<Appearance>(
    buildDraftAppearance(appearance),
  );
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftTheme(theme);
    setDraftAppearance(buildDraftAppearance(appearance));
    setIsGenerating(false);
  }, [appearance, open, theme]);

  const draftTypography = useMemo(
    () => resolveThemeTypography(getAppearanceTypography(draftAppearance)),
    [draftAppearance],
  );

  const hasChanges = useMemo(
    () =>
      JSON.stringify({
        theme,
        appearance: buildDraftAppearance(appearance),
      }) !==
      JSON.stringify({
        theme: draftTheme,
        appearance: draftAppearance,
      }),
    [appearance, draftAppearance, draftTheme, theme],
  );

  const updateTypography = (updates: Partial<{ fontPreset: FontPreset; fontSize: FontSize }>) => {
    setDraftAppearance((current) => {
      const nextTypography = {
        ...getAppearanceTypography(current),
        ...updates,
      };

      if (updates.fontPreset) {
        delete nextTypography.fontFamily;
      }

      return setAppearanceTypography(current, nextTypography);
    });
  };

  const generateRandomDraft = async () => {
    setIsGenerating(true);
    try {
      const colors = await generateRandomPalette({});
      setDraftAppearance((current) => ({
        ...current,
        random: createThemeSpecification(colors, draftTypography),
      }));
      setDraftTheme("random");
    } catch (error) {
      toast.error("Could not generate theme", {
        description:
          error instanceof Error
            ? error.message
            : "The HueMint request failed. Try again.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleThemeSelection = async (nextTheme: Theme) => {
    if (nextTheme !== "random") {
      setDraftTheme(nextTheme);
      return;
    }

    if (draftAppearance.random) {
      setDraftTheme("random");
      return;
    }

    await generateRandomDraft();
  };

  const handleSave = () => {
    const nextAppearance = setAppearanceTypography(
      replaceAppearanceColorsWithDefaults(draftAppearance),
      draftTypography,
    );
    setAppearance(nextAppearance);
    setTheme(draftTheme);
    onOpenChange(false);
    toast.success("Theme saved");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100%-1.5rem)] max-w-none gap-0 overflow-hidden border-app-border-strong/60 bg-background p-0 sm:w-[min(1240px,calc(100%-3rem))] sm:max-w-[1240px]"
        aria-describedby={undefined}
      >
        <div className="grid gap-6 p-6">
          <DialogHeader className="gap-1">
            <DialogTitle>Theme</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {getThemeLabel(draftTheme)}
            </p>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start">
            <section className="grid gap-2">
              <div className="px-1">
                <h3 className="text-sm font-semibold text-foreground">Theme options</h3>
              </div>
              <div className="grid gap-2">
                {COLOR_SCHEME_OPTIONS.map((option) => (
                  <ThemeSelectorRow
                    key={option.id}
                    active={draftTheme === option.id}
                    label={option.label}
                    icon={option.icon}
                    onSelect={() => void handleThemeSelection(option.id)}
                    trailing={
                      option.id === "random" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-full px-3"
                          disabled={isGenerating}
                          onClick={(event) => {
                            event.stopPropagation();
                            void generateRandomDraft();
                          }}
                        >
                          <RefreshCw
                            className={cn("h-3.5 w-3.5", isGenerating && "animate-spin")}
                          />
                          <span className="ml-1.5 text-xs">New</span>
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </div>
            </section>

            <section className="grid gap-2">
              <div className="px-1">
                <h3 className="text-sm font-semibold text-foreground">Font options</h3>
              </div>
              <div className="grid gap-2">
                {FONT_PRESET_OPTIONS.map((option) => (
                  <ThemeSelectorRow
                    key={option.id}
                    active={draftTypography.fontPreset === option.id}
                    label={option.label}
                    onSelect={() => updateTypography({ fontPreset: option.id })}
                    style={{ fontFamily: option.family }}
                  />
                ))}
              </div>
            </section>

            <section className="grid gap-2">
              <div className="px-1">
                <h3 className="text-sm font-semibold text-foreground">Font size options</h3>
              </div>
              <div className="grid gap-2">
                {FONT_SIZE_OPTIONS.map((option) => (
                  <ThemeSelectorRow
                    key={option.id}
                    active={draftTypography.fontSize === option.id}
                    label={option.label}
                    meta={option.rootSize}
                    icon={Type}
                    onSelect={() => updateTypography({ fontSize: option.id })}
                  />
                ))}
              </div>
            </section>
          </div>

          <ThemePreview appearance={draftAppearance} theme={draftTheme} />

          <DialogFooter className="justify-between border-t border-app-border-strong/60 pt-4 sm:flex-row sm:items-center">
            <div className="text-xs text-muted-foreground">
              Preview updates before save.
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || isGenerating}
              >
                Save
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
