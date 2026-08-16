import { createRequire } from "node:module";
import path from "node:path";
import { isDwHeadless } from "@autumn/env/dw";
import { publicPathBase } from "@autumn/env/paths";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const require = createRequire(import.meta.url);

const headless = isDwHeadless();
const apiPrefix = (process.env.VITE_API_URL || "").replace(/\/$/, "");
const apiIsRelative = apiPrefix.startsWith("/") && !apiPrefix.startsWith("//");
const serverPort = process.env.SERVER_PORT
	? Number.parseInt(process.env.SERVER_PORT, 10)
	: 8080;

export default defineConfig({
	base: publicPathBase(process.env.VITE_CHECKOUT_URL),
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
		port: Number.parseInt(process.env.VITE_PORT || "3001", 10),
		allowedHosts: headless
			? true
			: [".ngrok.app", ".ngrok-free.app", "localhost", ".localhost"],
		fs: {
			allow: [".."],
		},
		...(apiIsRelative && {
			proxy: {
				[apiPrefix]: {
					changeOrigin: true,
					rewrite: (path: string) => path.slice(apiPrefix.length) || "/",
					target: `http://127.0.0.1:${serverPort}`,
				},
			},
		}),
	},
});
