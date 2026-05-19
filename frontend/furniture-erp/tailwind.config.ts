import type { Config } from "tailwindcss";

/**
 * Design-system corner radii (px).
 * Used by utilities: rounded-sm, rounded-md, rounded-lg, rounded-xl, etc.
 * Edit values here — they apply app-wide via Tailwind.
 */
export const borderRadius = {
  none: "0px",
  sm: "4px",
  DEFAULT: "6px",
  md: "4px",
  lg: "4px",
  xl: "5px",
  "2xl": "8px",
  "3xl": "10px",
  full: "9999px",
} as const;

export default {
  theme: {
    extend: {
      borderRadius,
    },
  },
} satisfies Config;
