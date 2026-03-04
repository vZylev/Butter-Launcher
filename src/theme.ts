import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  globalCss: {
    "*": {
      boxSizing: "border-box",
      margin: 0,
      padding: 0,
    },
    "*, *::before, *::after": {
      scrollbarWidth: "thin",
      scrollbarColor: "rgba(59,130,246,0.6) transparent",
    },
    "*::-webkit-scrollbar": {
      width: "5px",
      height: "5px",
    },
    "*::-webkit-scrollbar-track": {
      background: "transparent",
    },
    "*::-webkit-scrollbar-thumb": {
      background: "rgba(0,0,0,0.45)",
      borderRadius: "999px",
      border: "1px solid rgba(255,255,255,0.08)",
    },
    "*::-webkit-scrollbar-thumb:hover": {
      background: "rgba(0,0,0,0.60)",
    },
    "body::-webkit-scrollbar": {
      width: "0px",
      background: "transparent",
    },
    html: {
      height: "100%",
      fontSize: "16px",
    },
    body: {
      height: "100%",
      background: "#080c14",
      color: "white",
      fontFamily:
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      overflowX: "hidden",
      userSelect: "none",
      WebkitUserSelect: "none",
    },
    "#root": {
      height: "100%",
    },
    "img": {
      userSelect: "none",
    },
    "input, textarea": {
      userSelect: "auto",
      WebkitUserSelect: "auto",
    },
  },
  theme: {
    tokens: {
      colors: {
        // Brand palette
        brand: {
          50:  { value: "#e8f1ff" },
          100: { value: "#c3d9ff" },
          200: { value: "#90baff" },
          300: { value: "#5595ff" },
          400: { value: "#2371f0" },
          500: { value: "#0268D4" },
          600: { value: "#0052ac" },
          700: { value: "#003d82" },
          800: { value: "#00295a" },
          900: { value: "#001533" },
        },
        // Cyan accent
        accent: {
          50:  { value: "#e0fefe" },
          200: { value: "#67f7f7" },
          400: { value: "#00d8da" },
          500: { value: "#02D4D4" },
          600: { value: "#00aaa9" },
        },
        // Surface tokens (dark glass panels)
        surface: {
          base:   { value: "rgba(11,15,26,0.80)" },
          raised: { value: "rgba(19,25,40,0.85)" },
          float:  { value: "rgba(27,32,48,0.90)" },
          border: { value: "rgba(255,255,255,0.08)" },
          borderStrong: { value: "rgba(255,255,255,0.14)" },
        },
        // Overlay
        overlay: {
          light: { value: "rgba(255,255,255,0.06)" },
          medium: { value: "rgba(255,255,255,0.10)" },
          heavy:  { value: "rgba(255,255,255,0.15)" },
          dark:   { value: "rgba(0,0,0,0.55)" },
        },
      },
      fonts: {
        heading: { value: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
        body:    { value: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
        mono:    { value: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" },
      },
      radii: {
        sm: { value: "6px" },
        md: { value: "10px" },
        lg: { value: "14px" },
        xl: { value: "18px" },
        "2xl": { value: "24px" },
        full: { value: "9999px" },
      },
    },
    semanticTokens: {
      colors: {
        // Backgrounds
        "bg.base":    { value: "#080c14" },
        "bg.subtle":  { value: "#0d1120" },
        "bg.muted":   { value: "{colors.surface.base}" },
        "bg.surface": { value: "{colors.surface.raised}" },
        "bg.float":   { value: "{colors.surface.float}" },

        // Borders
        "border.subtle":  { value: "{colors.surface.border}" },
        "border.muted":   { value: "{colors.surface.borderStrong}" },
        "border.brand":   { value: "rgba(2,104,212,0.50)" },

        // Text
        "text.primary":   { value: "rgba(255,255,255,0.95)" },
        "text.secondary": { value: "rgba(255,255,255,0.65)" },
        "text.muted":     { value: "rgba(255,255,255,0.40)" },
        "text.brand":     { value: "#5baeff" },

        // Brand gradient (used as CSS gradient string in style props)
        "brand.solid":  { value: "#0268D4" },
        "accent.solid": { value: "#02D4D4" },

        // States
        "red.solid":   { value: "#dc2626" },
        "green.solid": { value: "#16a34a" },
        "amber.solid": { value: "#d97706" },
      },
      radii: {
        panel: { value: "{radii.xl}" },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
