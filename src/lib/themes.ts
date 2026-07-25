/**
 * Visual themes — same layout/structure, different color palettes.
 * `midnight` is the original default ("Midnight Observatory").
 */

export const THEME_IDS = [
  "midnight",
  "ocean",
  "forest",
  "sunset",
  "rose",
  "amethyst",
  "gold",
  "slate",
  "ember",
  "aurora",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "midnight";

export type ThemeMeta = {
  id: ThemeId;
  /** Short color chips for the picker */
  swatches: [string, string, string];
  name: { es: string; en: string };
  description: { es: string; en: string };
};

export const THEMES: ThemeMeta[] = [
  {
    id: "midnight",
    swatches: ["#2dd4bf", "#a78bfa", "#0a0c16"],
    name: { es: "Medianoche", en: "Midnight" },
    description: {
      es: "Observatorio nocturno — teal, violeta y rosa (predeterminado)",
      en: "Midnight observatory — teal, violet & rose (default)",
    },
  },
  {
    id: "ocean",
    swatches: ["#38bdf8", "#6366f1", "#061018"],
    name: { es: "Océano", en: "Ocean" },
    description: {
      es: "Azules profundos y cian fresco",
      en: "Deep blues and cool cyan",
    },
  },
  {
    id: "forest",
    swatches: ["#4ade80", "#34d399", "#07140e"],
    name: { es: "Bosque", en: "Forest" },
    description: {
      es: "Verdes esmeralda y musgo",
      en: "Emerald and moss greens",
    },
  },
  {
    id: "sunset",
    swatches: ["#fb923c", "#f472b6", "#140a08"],
    name: { es: "Atardecer", en: "Sunset" },
    description: {
      es: "Naranja, coral y ámbar cálido",
      en: "Warm orange, coral and amber",
    },
  },
  {
    id: "rose",
    swatches: ["#f472b6", "#e879f9", "#140810"],
    name: { es: "Rosa", en: "Rose" },
    description: {
      es: "Rosas y magentas suaves",
      en: "Soft pinks and magentas",
    },
  },
  {
    id: "amethyst",
    swatches: ["#c084fc", "#818cf8", "#0c0818"],
    name: { es: "Amatista", en: "Amethyst" },
    description: {
      es: "Púrpuras e índigo",
      en: "Purples and indigo",
    },
  },
  {
    id: "gold",
    swatches: ["#fbbf24", "#f59e0b", "#120e08"],
    name: { es: "Oro", en: "Gold" },
    description: {
      es: "Dorados y tonos café oscuro",
      en: "Gold tones on dark coffee",
    },
  },
  {
    id: "slate",
    swatches: ["#94a3b8", "#64748b", "#0b0f14"],
    name: { es: "Pizarra", en: "Slate" },
    description: {
      es: "Grises fríos y minimalistas",
      en: "Cool minimal grays",
    },
  },
  {
    id: "ember",
    swatches: ["#f87171", "#fb7185", "#120808"],
    name: { es: "Ascua", en: "Ember" },
    description: {
      es: "Rojos y carbón ardiente",
      en: "Reds on burning charcoal",
    },
  },
  {
    id: "aurora",
    swatches: ["#2dd4bf", "#22d3ee", "#0a1214"],
    name: { es: "Aurora", en: "Aurora" },
    description: {
      es: "Verde boreal, cian y toques de rosa",
      en: "Northern green, cyan and rose hints",
    },
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === "string" &&
    (THEME_IDS as readonly string[]).includes(value)
  );
}

/** Normalize stored / legacy values (e.g. "dark") to a known theme id. */
export function normalizeThemeId(value: unknown): ThemeId {
  if (value === "dark" || value === "default" || value === "" || value == null) {
    return DEFAULT_THEME;
  }
  if (isThemeId(value)) return value;
  return DEFAULT_THEME;
}

export function applyTheme(themeId: ThemeId | string) {
  if (typeof document === "undefined") return;
  const id = normalizeThemeId(themeId);
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* ignore */
  }
}

export const THEME_KEY = "mf_theme";
