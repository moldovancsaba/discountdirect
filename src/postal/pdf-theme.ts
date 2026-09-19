import theme from "./pdf-theme.generated.json" with { type: "json" };

export const pdfTheme = {
  primary: theme.primary,
  canvas: theme.canvas,
  surface: theme.surface,
  border: theme.border,
  text: theme.text,
  muted: theme.muted,
} as const;
