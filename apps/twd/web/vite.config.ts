import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, __dirname, "VITE_");
	const target = env.VITE_TWD_URL || "http://localhost:4100";
	return {
		root: __dirname,
		plugins: [react(), tailwindcss()],
		resolve: { dedupe: ["react", "react-dom"] },
		build: { outDir: path.resolve(__dirname, "dist"), emptyOutDir: true },
		server: {
			host: "0.0.0.0",
			port: Number.parseInt(process.env.VITE_PORT || "5920", 10),
			fs: { allow: [path.resolve(__dirname, "..")] },
			proxy: {
				"/api": {
					target,
					changeOrigin: true,
					rewrite: (p) => p.replace(/^\/api/, ""),
				},
			},
		},
	};
});
