import type { Config } from "tailwindcss";
import { nextui, NextUIPluginConfig } from "@nextui-org/react";

const nextUiConfig: NextUIPluginConfig = {
  addCommonColors: true,
  layout: {
    radius: {
      small: "4px",
      medium: "6px",
      large: "8px",
    },
  },

  themes: {
    light: {
      colors: {
        default: {
          foreground: "#2f2f26",
        },
        primary: {
          DEFAULT: "#8838FF",
          100: "#E7DCFF",
          800: "#562BB0",
        },
      },
    },
    dark: {
      colors: {
        default: {
          foreground: "#fafafa",
        },
        primary: {
          DEFAULT: "#BE8AFF",
          100: "#E7DCFF",
          800: "#562BB0",
        },
      },
    },
  },
};

export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/views/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        menlo: ["Menlo", "monospace"],
      },
      fontSize: {
        xs: ["11px", "16px"],
        sm: ["13px", "18px"],
        md: ["15px", "20px"],
        lg: ["17px", "24px"],
        xl: ["20px", "28px"],
      },
      colors: {
        t1: "#27272a",
        t2: "#52525b",
        t3: "#a1a1aa",
        background: "var(--background)",
        foreground: "var(--foreground)",
        sidebar: {
          // DEFAULT: "hsl(var(--sidebar-background))",
          DEFAULT: "",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "calc(var(--radius) - 0px)",
        md: "calc(var(--radius) - 3px)",
        sm: "calc(var(--radius) - 5px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require("tailwindcss-animate"), nextui(nextUiConfig)],
} satisfies Config;
