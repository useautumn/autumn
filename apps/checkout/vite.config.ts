import { createRequire } from "node:module";
import path from "node:path";
import { viteHmrClient } from "@autumn/env/viteDev";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const require = createRequire(import.meta.url);
const vitePort = Number.parseInt(process.env.VITE_PORT || "3001", 10);
const checkoutUrl =
	process.env.VITE_CHECKOUT_URL || process.env.VITE_FRONTEND_URL || "";

export default defineConfig({
	plugins: [react(), tsconfigPaths(), tailwindcss()],
	resolve: {
		dedupe: ["react", "react-dom"],
		alias: [
			{ find: "@", replacement: path.resolve(__dirname, "./src") },
			{
				find: /^react$/,
				replacement: require.resolve("react"),
			},
			{
				find: /^react-dom$/,
				replacement: require.resolve("react-dom"),
			},
			{
				find: /^react-dom\/client$/,
				replacement: require.resolve("react-dom/client"),
			},
			{
				find: /^react\/jsx-runtime$/,
				replacement: require.resolve("react/jsx-runtime"),
			},
			{
				find: /^react\/jsx-dev-runtime$/,
				replacement: require.resolve("react/jsx-dev-runtime"),
			},
		],
	},
	optimizeDeps: {
		exclude: ["@autumn/shared", "zod/v4"],
	},
	server: {
		host: "0.0.0.0",
		port: vitePort,
		hmr: viteHmrClient({ frontendUrl: checkoutUrl, vitePort }),
		allowedHosts: [
			".autumnworktree.com",
			".ngrok.app",
			".ngrok-free.app",
			"localhost",
			".localhost",
		],
		fs: {
			allow: [".."],
		},
	},
});
