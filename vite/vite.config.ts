import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),

			// Hide Radix UI imports with cleaner aliases
			"@radix/accordion": "@radix-ui/react-accordion",
			"@radix/checkbox": "@radix-ui/react-checkbox",
			"@radix/context-menu": "@radix-ui/react-context-menu",
			"@radix/dialog": "@radix-ui/react-dialog",
			"@radix/dropdown-menu": "@radix-ui/react-dropdown-menu",
			"@radix/popover": "@radix-ui/react-popover",
			"@radix/scroll-area": "@radix-ui/react-scroll-area",
			"@radix/select": "@radix-ui/react-select",
			"@radix/separator": "@radix-ui/react-separator",
			"@radix/slot": "@radix-ui/react-slot",
			"@radix/switch": "@radix-ui/react-switch",
			"@radix/tabs": "@radix-ui/react-tabs",
			"@radix/tooltip": "@radix-ui/react-tooltip",
		},
		// Preserve symlinks for workspace dependencies
		preserveSymlinks: true,
	},
	optimizeDeps: {
		// Exclude workspace dependencies from pre-bundling to avoid cache issues
		exclude: [
			"@autumn/shared",
			"better-auth",
			"better-auth/react",
			"@better-auth/stripe",
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
		allowedHosts: [
			"dev.useautumn.com",
			"client.dev.useautumn.com",
			"localhost",
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
});
