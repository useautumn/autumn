import { spawn } from "node:child_process";
import { detectAndSetPorts } from "./detect-ports.js";

async function startDev() {
	try {
		// Detect and set ports
		const { vitePort, serverPort } = await detectAndSetPorts();

		console.log("\n🚀 Starting development servers...\n");

		// Start concurrently with the detected ports
		const concurrentlyCmd = spawn(
			"bunx",
			[
				"concurrently",
				`"cd shared && bun run dev"`,
				`"cd server && SERVER_PORT=${serverPort} bun dev"`,
				`"cd server && bun workers:dev"`,
				`"cd vite && VITE_PORT=${vitePort} bun dev"`,
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
