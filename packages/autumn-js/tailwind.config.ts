import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";
import {
	isolateInsideOfContainer,
	scopedPreflightStyles,
} from "tailwindcss-scoped-preflight";

export default {
	prefix: "au-",
	corePlugins: {
		preflight: false, // This removes @tailwind base completely
	},
	darkMode: ["class"],
	content: ["./src/**/*.{html,js,ts,tsx}"],
	theme: {
		extend: {
			colors: {
				background: "hsl(var(--au-background))",
				foreground: "hsl(var(--au-foreground))",
				card: {
					DEFAULT: "hsl(var(--au-card))",
					foreground: "hsl(var(--au-card-foreground))",
				},
				popover: {
					DEFAULT: "hsl(var(--au-popover))",
					foreground: "hsl(var(--au-popover-foreground))",
				},
				primary: {
					DEFAULT: "hsl(var(--au-primary))",
					foreground: "hsl(var(--au-primary-foreground))",
				},
				secondary: {
					DEFAULT: "hsl(var(--au-secondary))",
					foreground: "hsl(var(--au-secondary-foreground))",
				},
				muted: {
					DEFAULT: "hsl(var(--au-muted))",
					foreground: "hsl(var(--au-muted-foreground))",
				},
				accent: {
					DEFAULT: "hsl(var(--au-accent))",
					foreground: "hsl(var(--au-accent-foreground))",
				},
				destructive: {
					DEFAULT: "hsl(var(--au-destructive))",
					foreground: "hsl(var(--au-destructive-foreground))",
				},
				border: "hsl(var(--au-border))",
				input: "hsl(var(--au-input))",
				ring: "hsl(var(--au-ring))",
				chart: {
					"1": "hsl(var(--au-chart-1))",
					"2": "hsl(var(--au-chart-2))",
					"3": "hsl(var(--au-chart-3))",
					"4": "hsl(var(--au-chart-4))",
					"5": "hsl(var(--au-chart-5))",
				},
			},
			borderRadius: {
				lg: "var(--au-radius)",
				md: "calc(var(--au-radius) - 2px)",
				sm: "calc(var(--au-radius) - 4px)",
			},
			keyframes: {
				shine: {
					"0%": {
						backgroundPosition: "0% 50%",
					},
					"100%": {
						backgroundPosition: "200% 50%",
					},
				},
				bounceFast: {
					"0%, 100%": {
						transform: "translateY(0)",
					},
					"20%": {
						transform: "translateY(-8px)",
					},
					"40%": {
						transform: "translateY(-4px)",
					},
					"60%": {
						transform: "translateY(-8px)",
					},
					"80%": {
						transform: "translateY(-4px)",
					},
				},
				bounceClick: {
					"0%": {
						transform: "scale(1)",
					},
					"20%": {
						transform: "scale(0.96)",
					},
					"50%": {
						transform: "scale(1.04)",
					},
					"100%": {
						transform: "scale(1)",
					},
				},
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
				shine: "shine 3s ease-in-out infinite",
				"bounce-fast": "bounceFast 0.6s cubic-bezier(0.4,0,0.6,1) infinite",
				"bounce-click": "bounceClick 0.3s cubic-bezier(0.4,0,0.6,1)",
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
			},
		},
	},
	plugins: [
		tailwindAnimate,
		scopedPreflightStyles({
			isolationStrategy: isolateInsideOfContainer(".au-root"),
		}),
	],
} satisfies Config;
