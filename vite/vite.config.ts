import fs from "node:fs";
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

function printDevUrls(): Plugin {
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

				// Sparq public tunnel URL (optional — only when sparq is active).
				let sparqUrl: string | undefined;
				try {
					const cfg = JSON.parse(
						fs.readFileSync(
							path.resolve(__dirname, "..", ".sparq", "config.json"),
							"utf-8",
						),
					) as { routes?: { hostname: string }[] };
					const web = cfg.routes?.find((r) => r.hostname.includes("-web."));
					if (web) sparqUrl = `https://${web.hostname}`;
				} catch {
					/* missing file is the normal case */
				}
				if (sparqUrl) {
					server.config.logger.info(
						`  \x1b[32m➜\x1b[0m  \x1b[1mSparq\x1b[0m:    \x1b[36m${sparqUrl}/\x1b[0m`,
					);
				}
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
		printDevUrls(),
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
			// Per-developer tunnel suffixes (e.g. agent worktree sparq URLs).
			...(process.env.DEV_EXTRA_CORS_ORIGINS ?? "")
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
				.flatMap((sfx) => [sfx, `.${sfx}`]),
		],
		watch: {
			usePolling: true, // Required for file watching in Docker on Windows
			interval: 1000,
		},
		hmr: {
			port: process.env.VITE_PORT
				? Number.parseInt(process.env.VITE_PORT)
				: 3000,
			// Worktree URLs (wt<N>.localhost / wt<N>-USER-web.atmn.lol) are served
			// via portless/sparq on :443; the HMR WS must dial that, not the local port.
			clientPort: /^https?:\/\/wt\d/.test(process.env.VITE_FRONTEND_URL ?? "")
				? 443
				: undefined,
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
