import path from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { viteHmrClient } from "../packages/env/src/viteDev.js";
import { sharedBundle } from "./viteSharedBundle.ts";

process.env.VITE_BACKEND_URL ||= "http://localhost:8080";
process.env.VITE_FRONTEND_URL ||= "http://localhost:3000";

const vitePort = process.env.VITE_PORT
	? Number.parseInt(process.env.VITE_PORT, 10)
	: 3000;
const frontendUrl = process.env.VITE_FRONTEND_URL || "";
const isCapyDev = process.env.CAPY_DEV === "1";
if (isCapyDev) {
	process.env.VITE_BACKEND_URL = "/__autumn_api";
	process.env.VITE_CAPY_DEV = "1";
}

function relativeRedirectLocation(location: string): string {
	try {
		const url = new URL(location);
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return location;
	}
}

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

export default defineConfig({
	define: {
		__APP_ENV__: JSON.stringify(process.env.VITE_APP_ENV || ""),
		__WORKTREE_NUM__: JSON.stringify(process.env.VITE_WORKTREE_NUM || "1"),
	},
	esbuild: {
		pure: ["console.log"],
	},
	plugins: [
		...(isCapyDev
			? [sharedBundle({ sharedDir: path.resolve(__dirname, "../shared") })]
			: []),
		react(),
		tailwindcss(),
		tsconfigPaths(),
		sentryVitePlugin({
			org: process.env.VITE_SENTRY_ORG,
			project: process.env.VITE_SENTRY_PROJECT,
			telemetry: false,
		}),
		printPortlessUrl(),
	],

	resolve: {
		// recharts builds on React context; two copies mean the chart's provider
		dedupe: ["react", "react-dom", "recharts"],
		alias: {
			"@": path.resolve(__dirname, "./src"),

			"autumn-js/react": path.resolve(
				__dirname,
				"../packages/autumn-js/src/react/index.ts",
			),
			"autumn-js": path.resolve(
				__dirname,
				"../packages/autumn-js/src/sdk/index.ts",
			),
			"@autumn/atmn-old/skills": path.resolve(
				__dirname,
				"../packages/atmn-old/src/prompts/skills/index.ts",
			),
		},
	},

	optimizeDeps: {
		// `exclude` below), so Vite never sees them when crawling from main.tsx,
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
		exclude: [
			"@autumn/shared",
			"@autumn/atmn-old/skills",
			"autumn-js",
			"autumn-js/react",
			"better-auth",
			"better-auth/react",
			"@better-auth/stripe",
			"@orpc/contract",
			"@autumn/ui",
			...(isCapyDev
				? []
				: [
						"zod/v4",
						"drizzle-orm/pg-core",
						"drizzle-orm",
						"@date-fns/utc",
						"date-fns",
					]),
		],
	},

	cacheDir: "node_modules/.vite",

	server: {
		host: "0.0.0.0",
		port: vitePort,
		strictPort: false,
		...(frontendUrl && {
			origin: frontendUrl,
		}),
		allowedHosts: [
			"dev.useautumn.com",
			"client.dev.useautumn.com",
			"localhost",
			".localhost",
			".autumnworktree.com",
			".capysandbox.net",
			".ngrok.app",
			".ngrok-free.app",
		],
		proxy: isCapyDev
			? {
					"/__autumn_api": {
						target: "http://127.0.0.1:8080",
						changeOrigin: false,
						rewrite: (path) => path.replace(/^\/__autumn_api/, ""),
					},
					"/api/auth": {
						target: "http://127.0.0.1:8080",
						changeOrigin: false,
					},
					"/o/oauth2": {
						target: "http://127.0.0.1:4000",
						changeOrigin: false,
						configure: (proxy) => {
							proxy.on("proxyRes", (response) => {
								const location = response.headers.location;
								if (!location) return;
								response.headers.location = relativeRedirectLocation(location);
							});
						},
					},
					"/_emulate": {
						target: "http://127.0.0.1:4000",
						changeOrigin: false,
					},
				}
			: undefined,
		watch: {
			usePolling: !isCapyDev,
			interval: 1000,
		},
		hmr: isCapyDev
			? { clientPort: 443 }
			: viteHmrClient({ frontendUrl, vitePort }),
		fs: {
			allow: [".."],
		},
	},

	build: {
		sourcemap: !process.env.CI,
	},
});
