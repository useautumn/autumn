import { spawn } from "node:child_process";
import { detectAndSetPorts } from "./detect-ports.js";

async function startDev() {
	try {
		// Detect and set ports
		const { vitePort, serverPort } = await detectAndSetPorts();

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
