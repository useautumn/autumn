import { createRequire } from "node:module";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const require = createRequire(import.meta.url);

export default defineConfig({
	plugins: [react(), tsconfigPaths(), tailwindcss()],
	resolve: {
		dedupe: ["react", "react-dom"],
		alias: [
			// `@` resolves into the MAIN vite app's src so its reused components find
			// their own `@/components/ui/...` + `@/lib/utils` imports unmodified.
			// Testbench's own files import each other via relative paths.
			{ find: "@", replacement: path.resolve(__dirname, "../../vite/src") },
			{ find: /^react$/, replacement: require.resolve("react") },
			{ find: /^react-dom$/, replacement: require.resolve("react-dom") },
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
		port: Number.parseInt(process.env.VITE_PORT || "5910", 10),
		fs: {
			// allow importing from the sibling vite/ app + repo root
			allow: ["../.."],
		},
	},
});
