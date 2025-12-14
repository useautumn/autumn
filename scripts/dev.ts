import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VITE_PORT = 3000;
const SERVER_PORT = 8080;

/**
 * Read environment variable from .env file
 */
function getEnvVariable(filePath: string, key: string): string | null {
	if (!existsSync(filePath)) {
		return null;
	}
	const content = readFileSync(filePath, "utf-8");
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
	const rootDir = dirname(fileURLToPath(import.meta.url));
	const projectRoot = join(rootDir, "..");

	try {
		// Check if using remote backend (api.useautumn.com)
		const viteEnvPath = join(projectRoot, "vite", ".env");
		const backendUrl =
			process.env.VITE_BACKEND_URL ||
			getEnvVariable(viteEnvPath, "VITE_BACKEND_URL");
		const isUsingRemoteBackend = backendUrl?.includes(".useautumn.com");

		if (isUsingRemoteBackend) {
			console.log("\n🌐 Using remote backend (*.useautumn.com)");
			console.log("⏭️  Skipping port cleanup...\n");
		} else {
			// Port cleanup disabled (detection is unreliable)
			console.log("⏭️  Skipping port cleanup...\n");
		}

		// Clear Vite cache to prevent dep optimization issues
		const viteCachePath = join(projectRoot, "vite", "node_modules", ".vite");
		if (existsSync(viteCachePath)) {
			console.log("🧹 Clearing Vite cache...\n");
			rmSync(viteCachePath, { recursive: true, force: true });
		}

		console.log("🚀 Starting development servers in watch mode...\n");

		// Use cmd on Windows, sh on Unix
		const isWindows = process.platform === "win32";

		let shellArgs: string[];
		if (isWindows) {
			const serverCmd = `cd server && set SERVER_PORT=${SERVER_PORT} && bun dev`;
			const workersCmd = `cd server && bun workers:dev`;
			const viteCmd = `cd vite && set VITE_PORT=${VITE_PORT} && bun dev`;
			shellArgs = [
				"cmd",
				"/c",
				`bunx concurrently -n server,workers,vite -c green,yellow,blue "${serverCmd}" "${workersCmd}" "${viteCmd}"`,
			];
		} else {
			shellArgs = [
				"sh",
				"-c",
				`bunx concurrently -n server,workers,vite -c green,yellow,blue "cd server && SERVER_PORT=${SERVER_PORT} bun dev" "cd server && bun workers:dev" "cd vite && VITE_PORT=${VITE_PORT} bun dev"`,
			];
		}

		const concurrentlyProc = Bun.spawn(shellArgs, {
			cwd: projectRoot,
			env: {
				...process.env,
				VITE_PORT: VITE_PORT.toString(),
				SERVER_PORT: SERVER_PORT.toString(),
			},
			stdout: "inherit",
			stderr: "inherit",
			onExit(proc, exitCode, signalCode, error) {
				if (error) {
					console.error("Failed to start development servers:", error);
					process.exit(1);
				}
				if (exitCode !== 0 && exitCode !== null) {
					console.error(`Development servers exited with code ${exitCode}`);
				}
				process.exit(exitCode ?? 0);
			},
		});

		// Handle termination signals
		process.on("SIGINT", () => {
			console.log("\n\n🛑 Shutting down development servers...");
			concurrentlyProc.kill("SIGINT");
		});

		process.on("SIGTERM", () => {
			console.log("\n\n🛑 Shutting down development servers...");
			concurrentlyProc.kill("SIGTERM");
		});

		// Wait for the process to exit
		await concurrentlyProc.exited;
	} catch (error) {
		console.error("Error starting development servers:", error);
		process.exit(1);
	}
}

startDev();
