const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

type Rgb = {
  r: number;
  g: number;
  b: number;
};

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeChannel(channel: string) {
  return Number.parseInt(channel, 16);
}

function toHex(channel: number) {
  return clampChannel(channel).toString(16).padStart(2, "0");
}

export function isHexColor(value: string) {
  return HEX_COLOR_PATTERN.test(value);
}

export function normalizeHexColor(value: string) {
  if (!isHexColor(value)) {
    throw new Error(`Invalid hex color: ${value}`);
  }

  return value.toLowerCase();
}

export function hexToRgb(color: string): Rgb {
  const normalized = normalizeHexColor(color);
  return {
    r: normalizeChannel(normalized.slice(1, 3)),
    g: normalizeChannel(normalized.slice(3, 5)),
    b: normalizeChannel(normalized.slice(5, 7)),
  };
}

export function rgbToHex({ r, g, b }: Rgb) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function mixHexColors(base: string, tint: string, amount: number) {
  const weight = Math.max(0, Math.min(1, amount));
  const baseRgb = hexToRgb(base);
  const tintRgb = hexToRgb(tint);

  return rgbToHex({
    r: baseRgb.r + (tintRgb.r - baseRgb.r) * weight,
    g: baseRgb.g + (tintRgb.g - baseRgb.g) * weight,
    b: baseRgb.b + (tintRgb.b - baseRgb.b) * weight,
  });
}

export function withAlpha(color: string, alpha: number) {
  const { r, g, b } = hexToRgb(color);
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

function toLinearChannel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function getRelativeLuminance(color: string) {
  const { r, g, b } = hexToRgb(color);
  return (
    0.2126 * toLinearChannel(r) +
    0.7152 * toLinearChannel(g) +
    0.0722 * toLinearChannel(b)
  );
}

export function getReadableNeutralForeground(color: string) {
  return getRelativeLuminance(color) > 0.42 ? "#111111" : "#fafafa";
}
