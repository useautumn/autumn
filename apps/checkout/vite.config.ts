import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [react(), tsconfigPaths(), tailwindcss()],
	resolve: {
		dedupe: ["react", "react-dom"],
		alias: [
			{ find: "@", replacement: path.resolve(__dirname, "./src") },
			{
				find: /^react$/,
				replacement: path.resolve(__dirname, "./node_modules/react"),
			},
			{
				find: /^react-dom$/,
				replacement: path.resolve(__dirname, "./node_modules/react-dom"),
			},
			{
				find: /^react\/jsx-runtime$/,
				replacement: path.resolve(
					__dirname,
					"./node_modules/react/jsx-runtime.js",
				),
			},
		],
	},
	optimizeDeps: {
		exclude: ["@autumn/shared", "zod/v4"],
	},
	server: {
		host: "0.0.0.0",
		port: Number.parseInt(process.env.VITE_PORT || "3001", 10),
		fs: {
			allow: [".."],
		},
	},
});
