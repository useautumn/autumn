import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { detectAndSetPorts } from "./detect-ports.js";

/**
 * Read environment variable from .env file
 */
function getEnvVariable(filePath, key) {
	if (!fs.existsSync(filePath)) {
		return null;
	}
	const content = fs.readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#")) {
			const [envKey, ...valueParts] = trimmed.split("=");
			if (envKey && envKey.trim() === key) {
				return valueParts.join("=");
			}
		}
	}
	return null;
}

async function startDev() {
	try {
		// Check if using remote backend (api.useautumn.com)
		const rootDir = path.dirname(new URL(import.meta.url).pathname);
		const projectRoot = path.join(rootDir, "..");
		const viteEnvPath = path.join(projectRoot, "vite", ".env");
		const backendUrl =
			process.env.VITE_BACKEND_URL || getEnvVariable(viteEnvPath, "VITE_BACKEND_URL");
		const isUsingRemoteBackend = backendUrl && backendUrl.includes("api.useautumn.com");

		let vitePort = 3000;
		let serverPort = 8080;

		if (isUsingRemoteBackend) {
			console.log("\n🌐 Using remote backend (api.useautumn.com)");
			console.log("⏭️  Skipping port detection...\n");
		} else {
			// Detect and set ports
			const ports = await detectAndSetPorts();
			vitePort = ports.vitePort;
			serverPort = ports.serverPort;
		}

		// Step 1: Build shared package first (initial build)
		console.log("\n📦 Building shared package...\n");
		const buildShared = spawn("bun", ["run", "build"], {
			cwd: "shared",
			stdio: "inherit",
			shell: true,
		});

		await new Promise((resolve, reject) => {
			buildShared.on("close", (code) => {
				if (code !== 0) {
					reject(new Error(`Shared package build failed with code ${code}`));
				} else {
					resolve();
				}
			});
			buildShared.on("error", reject);
		});

		console.log("\n✅ Shared package built successfully!\n");
		console.log("🚀 Starting development servers in watch mode...\n");

		// Step 2: Start server, workers, and vite first (they'll use the built shared package)
		const concurrentlyCmd = spawn(
			"bunx",
			[
				"concurrently",
				"-n",
				"server,workers,vite,shared",
				"-c",
				"green,yellow,blue,cyan",
				`"cd server && SERVER_PORT=${serverPort} bun dev"`,
				`"cd server && bun workers:dev"`,
				`"cd vite && VITE_PORT=${vitePort} bun dev"`,
				`"cd shared && bun run dev:watch"`,
			],
			{
				stdio: "inherit",
				shell: true,
				env: {
					...process.env,
					VITE_PORT: vitePort.toString(),
					SERVER_PORT: serverPort.toString(),
				},
			},
		);

		concurrentlyCmd.on("error", (error) => {
			console.error("Failed to start development servers:", error);
			process.exit(1);
		});

		concurrentlyCmd.on("exit", (code) => {
			if (code !== 0) {
				console.error(`Development servers exited with code ${code}`);
			}
			process.exit(code);
		});

		// Handle termination signals
		process.on("SIGINT", () => {
			console.log("\n\n🛑 Shutting down development servers...");
			concurrentlyCmd.kill("SIGINT");
		});

		process.on("SIGTERM", () => {
			console.log("\n\n🛑 Shutting down development servers...");
			concurrentlyCmd.kill("SIGTERM");
		});
	} catch (error) {
		console.error("Error starting development servers:", error);
		process.exit(1);
	}
}

startDev();
