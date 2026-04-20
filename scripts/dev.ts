import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const worktreeIdx = process.argv.indexOf("--worktree");
const worktreeNum =
	worktreeIdx !== -1 && process.argv[worktreeIdx + 1]
		? Number.parseInt(process.argv[worktreeIdx + 1], 10)
		: 1;
const portOffset = (worktreeNum - 1) * 100;

const VITE_PORT = process.env.VITE_PORT
	? Number.parseInt(process.env.VITE_PORT, 10)
	: 3000 + portOffset;
const SERVER_PORT = process.env.SERVER_PORT
	? Number.parseInt(process.env.SERVER_PORT, 10)
	: 8080 + portOffset;
const CHECKOUT_PORT = process.env.CHECKOUT_PORT
	? Number.parseInt(process.env.CHECKOUT_PORT, 10)
	: 3001 + portOffset;
const skipWorkers = worktreeNum > 1;
const isProductionMode = process.argv.includes("--production");

const envFile = process.env.ENV_FILE ?? ".env";
const viteAppEnv = envFile.includes(".env.prod")
	? "prod"
	: envFile.includes(".env.staging")
		? "staging"
		: "dev";

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

function killPorts({ ports }: { ports: number[] }) {
	if (process.platform === "win32") {
		return;
	}

	try {
		const portArgs = ports.map((port) => `-ti:${port}`);
		const result = Bun.spawnSync(["lsof", ...portArgs], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const output = new TextDecoder().decode(result.stdout).trim();
		if (!output) {
			return;
		}

		const pids = [...new Set(output.split("\n").filter(Boolean))];
		for (const pid of pids) {
			process.kill(Number.parseInt(pid, 10), "SIGKILL");
		}

		console.log(`Killed processes on ports ${ports.join(", ")}.\n`);
	} catch (error) {
		console.warn("Port cleanup failed, continuing without cleanup.", error);
	}
}

async function startDev() {
	const rootDir = dirname(fileURLToPath(import.meta.url));
	const projectRoot = join(rootDir, "..");
	const serverOnly = process.argv.includes("--server-only");

	try {
		if (serverOnly) {
			console.log("Starting server and workers only (--server-only)...\n");
		} else {
			// Check if using remote backend (api.useautumn.com)
			const viteEnvPath = join(projectRoot, "vite", ".env");
			const backendUrl =
				process.env.VITE_BACKEND_URL ||
				getEnvVariable(viteEnvPath, "VITE_BACKEND_URL");
			const isUsingRemoteBackend = backendUrl?.includes(".useautumn.com");

			if (isUsingRemoteBackend) {
				console.log("\n Using remote backend (*.useautumn.com)");
				console.log("Skipping port cleanup...\n");
			} else {
				console.log("Cleaning up local dev ports...\n");
				killPorts({
					ports: [VITE_PORT, SERVER_PORT, CHECKOUT_PORT],
				});
			}

			// Clear Vite cache to prevent dep optimization issues
			const viteCachePath = join(projectRoot, "vite", "node_modules", ".vite");
			if (existsSync(viteCachePath)) {
				console.log("Clearing Vite cache...\n");
				rmSync(viteCachePath, { recursive: true, force: true });
			}

			// Clear checkout Vite cache
			const checkoutCachePath = join(
				projectRoot,
				"apps/checkout",
				"node_modules",
				".vite",
			);
			if (existsSync(checkoutCachePath)) {
				console.log("Clearing Checkout Vite cache...\n");
				rmSync(checkoutCachePath, { recursive: true, force: true });
			}
		}

		if (worktreeNum > 1) {
			console.log(`Starting worktree ${worktreeNum} (no workers)...\n`);
		} else if (isProductionMode) {
			console.log("Starting local servers with NODE_ENV=production...\n");
		} else {
			console.log("Starting development servers...\n");
		}

		console.log(`  vite:     http://localhost:${VITE_PORT}`);
		console.log(`  server:   http://localhost:${SERVER_PORT}`);
		console.log(`  checkout: http://localhost:${CHECKOUT_PORT}\n`);

		// Use cmd on Windows, sh on Unix
		const isWindows = process.platform === "win32";

		let shellArgs: string[];
		if (serverOnly) {
			// Only start server and workers (for test sandboxes)
			if (isWindows) {
				const serverCmd = `cd server && set SERVER_PORT=${SERVER_PORT} && bun start`;
				const workersCmd = `cd server && bun workers`;
				shellArgs = [
					"cmd",
					"/c",
					`bunx concurrently -n server,workers -c green,yellow "${serverCmd}" "${workersCmd}"`,
				];
			} else {
				shellArgs = [
					"sh",
					"-c",
					`bunx concurrently -n server,workers -c green,yellow "cd server && SERVER_PORT=${SERVER_PORT} bun start" "cd server && bun workers"`,
				];
			}
		} else {
			const names = ["server"];
			const colors = ["green"];
			const serverScript = isProductionMode ? "dev:prod" : "dev";
			const workersScript = isProductionMode ? "workers:prod" : "workers:dev";
			const cmds = [
				isWindows
					? `"cd server && set SERVER_PORT=${SERVER_PORT} && bun ${serverScript}"`
					: `"cd server && SERVER_PORT=${SERVER_PORT} bun ${serverScript}"`,
			];

			if (!skipWorkers) {
				names.push("workers");
				colors.push("yellow");
				cmds.push(
					isWindows
						? `"cd server && bun ${workersScript}"`
						: `"cd server && bun ${workersScript}"`,
				);
			}

			names.push("vite", "checkout");
			colors.push("blue", "magenta");
			cmds.push(
				isWindows
					? `"cd vite && set VITE_PORT=${VITE_PORT} && bun dev"`
					: `"cd vite && VITE_PORT=${VITE_PORT} bun dev"`,
				isWindows
					? `"cd apps/checkout && set VITE_PORT=${CHECKOUT_PORT} && bun dev"`
					: `"cd apps/checkout && VITE_PORT=${CHECKOUT_PORT} bun dev"`,
			);

			shellArgs = [
				isWindows ? "cmd" : "sh",
				isWindows ? "/c" : "-c",
				`bunx concurrently -n ${names.join(",")} -c ${colors.join(",")} ${cmds.join(" ")}`,
			];
		}

		const concurrentlyProc = Bun.spawn(shellArgs, {
			cwd: projectRoot,
		env: {
			...process.env,
			VITE_PORT: VITE_PORT.toString(),
			SERVER_PORT: SERVER_PORT.toString(),
			CHECKOUT_PORT: CHECKOUT_PORT.toString(),
			VITE_APP_ENV: viteAppEnv,
				...(worktreeNum > 1 && {
					CLIENT_URL: `http://localhost:${VITE_PORT}`,
					BETTER_AUTH_URL: `http://localhost:${SERVER_PORT}`,
					VITE_BACKEND_URL: `http://localhost:${SERVER_PORT}`,
					VITE_FRONTEND_URL: `http://localhost:${VITE_PORT}`,
				}),
			},
			stdout: "inherit",
			stderr: "inherit",
			onExit(
				_proc: unknown,
				exitCode: number | null,
				_signalCode: number | null,
				error: Error | null,
			) {
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
