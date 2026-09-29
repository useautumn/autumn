import { createRequire } from "node:module";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const require = createRequire(import.meta.url);
const uiSrc = path.resolve(__dirname, "../../../packages/ui/src");
const single = (name: string) => ({
	find: new RegExp(`^${name.replace("/", "\\/")}$`),
	replacement: require.resolve(name),
});

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, __dirname, "VITE_");
	const target = env.VITE_TWD_URL || "http://localhost:4100";
	return {
		root: __dirname,
		plugins: [react(), tailwindcss()],
		resolve: {
			dedupe: ["react", "react-dom"],
			alias: [
				{ find: /^@autumn\/ui\/(.*)$/, replacement: `${uiSrc}/$1` },
				single("react"),
				single("react-dom"),
				single("react-dom/client"),
				single("react/jsx-runtime"),
				single("react/jsx-dev-runtime"),
				single("@tanstack/react-table"),
				{
					find: /^recharts$/,
					replacement: path.resolve(uiSrc, "../node_modules/recharts"),
				},
			],
		},
		build: { outDir: path.resolve(__dirname, "dist"), emptyOutDir: true },
		server: {
			host: "0.0.0.0",
			port: Number.parseInt(process.env.VITE_PORT || "5920", 10),
			fs: { allow: [path.resolve(__dirname, "../../..")] },
			proxy: {
				"/api": {
					target,
					changeOrigin: true,
					ws: true,
				},
			},
		},
	};
});
