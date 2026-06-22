import path from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Defaults so the app works when no .env.local is present
// (e.g. after `bun dw disable`). Real values from .env / infisical /
// process.env still take precedence.
process.env.VITE_BACKEND_URL ||= "http://localhost:8080";
process.env.VITE_FRONTEND_URL ||= "http://localhost:3000";

function printPortlessUrl(): Plugin {
	return {
		name: "print-portless-url",
		apply: "serve",
		configureServer(server) {
			const portlessUrl = process.env.VITE_FRONTEND_URL;
			if (!portlessUrl) return;
			const originalPrint = server.printUrls.bind(server);
			server.printUrls = () => {
				originalPrint();
				server.config.logger.info(
					`  \x1b[32m➜\x1b[0m  \x1b[1mPortless\x1b[0m: \x1b[36m${portlessUrl}/\x1b[0m`,
				);
			};
		},
	};
}

// https://vite.dev/config/
export default defineConfig({
	define: {
		__APP_ENV__: JSON.stringify(process.env.VITE_APP_ENV || ""),
	},
	esbuild: {
		pure: ["console.log"],
	},
	plugins: [
		react(),
		tailwindcss(), // Automatically reads paths from tsconfig.json
		tsconfigPaths(),
		sentryVitePlugin({
			org: process.env.VITE_SENTRY_ORG,
			project: process.env.VITE_SENTRY_PROJECT,
			telemetry: false,
		}),
		printPortlessUrl(),
	],

	resolve: {
		dedupe: ["react", "react-dom"],
		alias: {
			"@": path.resolve(__dirname, "./src"),

			// Workspace packages
			"autumn-js/react": path.resolve(
				__dirname,
				"../packages/autumn-js/src/react/index.ts",
			),
			"autumn-js": path.resolve(
				__dirname,
				"../packages/autumn-js/src/sdk/index.ts",
			),
			"atmn/skills": path.resolve(
				__dirname,
				"../packages/atmn/src/prompts/skills/index.ts",
			),

		},
	},

	optimizeDeps: {
		// Only list deps the cold-start scanner can't reach on its own: base-ui
		// subpaths are pulled in transitively by excluded workspace deps (see
		// `exclude` below), so Vite never sees them when crawling from main.tsx,
		// and discovering them mid-session re-optimizes (504 Outdated Dep).
		// Directly-imported deps (phosphor, nanoid, etc.) are auto-discovered by
		// the scanner on cold start and must NOT be listed here.
		include: [
			"@base-ui/react/accordion",
			"@base-ui/react/button",
			"@base-ui/react/checkbox",
			"@base-ui/react/dialog",
			"@base-ui/react/field",
			"@base-ui/react/menu",
			"@base-ui/react/merge-props",
			"@base-ui/react/popover",
			"@base-ui/react/preview-card",
			"@base-ui/react/radio",
			"@base-ui/react/radio-group",
			"@base-ui/react/scroll-area",
			"@base-ui/react/select",
			"@base-ui/react/separator",
			"@base-ui/react/switch",
			"@base-ui/react/tabs",
			"@base-ui/react/tooltip",
			"@base-ui/react/use-render",
		],
		// Exclude workspace dependencies from pre-bundling to avoid cache issues
		exclude: [
			"@autumn/shared",
			"atmn/skills",
			"autumn-js",
			"autumn-js/react",
			"better-auth",
			"better-auth/react",
			"@better-auth/stripe",
			"zod/v4",
			"drizzle-orm/pg-core",
			"drizzle-orm",
			"@date-fns/utc",
			"date-fns",
			"@orpc/contract",
		],
	},

	// Clear cache on config change
	cacheDir: "node_modules/.vite",

	server: {
		host: "0.0.0.0", // Required for Docker
		port: process.env.VITE_PORT
			? Number.parseInt(process.env.VITE_PORT, 10)
			: 3000,
		strictPort: false, // Allow fallback to next available port
		// Make the printed "Local:" URL reflect portless when available.
		...(process.env.VITE_FRONTEND_URL && {
			origin: process.env.VITE_FRONTEND_URL,
		}),
		allowedHosts: [
			"dev.useautumn.com",
			"client.dev.useautumn.com",
			"localhost",
			".localhost",
		],
		watch: {
			usePolling: true, // Required for file watching in Docker on Windows
			interval: 1000,
		},
		hmr: {
			port: process.env.VITE_PORT
				? Number.parseInt(process.env.VITE_PORT)
				: 3000,
		},
		fs: {
			// Allow serving files from workspace root (monorepo support)
			allow: [".."],
		},
	},

	build: {
		// Disable sourcemaps in CI to reduce memory usage during build
		sourcemap: !process.env.CI,
	},
});
