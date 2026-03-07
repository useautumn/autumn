import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const worktreeIdx = process.argv.indexOf("--worktree");
const worktreeNum =
	worktreeIdx !== -1 && process.argv[worktreeIdx + 1]
		? Number.parseInt(process.argv[worktreeIdx + 1], 10)
		: 1;
const portOffset = (worktreeNum - 1) * 100;

const VITE_PORT = 3000 + portOffset;
const SERVER_PORT = 8080 + portOffset;
const CHECKOUT_PORT = 3001 + portOffset;
const skipWorkers = worktreeNum > 1;

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
	const serverOnly = process.argv.includes("--server-only");

	try {
		if (serverOnly) {
			console.log("Starting server and workers only (--server-only)...\n");
		} else {
			const viteEnvPath = join(projectRoot, "vite", ".env");
			const backendUrl =
				process.env.VITE_BACKEND_URL ||
				getEnvVariable(viteEnvPath, "VITE_BACKEND_URL");
			const isUsingRemoteBackend = backendUrl?.includes(".useautumn.com");

			if (isUsingRemoteBackend) {
				console.log("\n Using remote backend (*.useautumn.com)");
				console.log("Skipping port cleanup...\n");
			} else {
				console.log("Skipping port cleanup...\n");
			}

			const viteCachePath = join(projectRoot, "vite", "node_modules", ".vite");
			if (existsSync(viteCachePath)) {
				console.log("Clearing Vite cache...\n");
				rmSync(viteCachePath, { recursive: true, force: true });
			}

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
		} else {
			console.log("Starting development servers...\n");
		}

		console.log(`  vite:     http://localhost:${VITE_PORT}`);
		console.log(`  server:   http://localhost:${SERVER_PORT}`);
		console.log(`  checkout: http://localhost:${CHECKOUT_PORT}\n`);

		const isWindows = process.platform === "win32";

		let shellArgs: string[];
		if (serverOnly) {
			if (isWindows) {
				shellArgs = [
					"bunx",
					"concurrently",
					"-n",
					"server,workers",
					"-c",
					"green,yellow",
					"bun --cwd server dev",
					"bun --cwd server workers:dev",
				];
			} else {
				shellArgs = [
					"sh",
					"-c",
					`bunx concurrently -n server,workers -c green,yellow "cd server && bun dev" "cd server && bun workers:dev"`,
				];
			}
		} else {
			const names = ["server", "vite", "checkout"];
			const colors = ["green", "blue", "magenta"];
			const cmds = isWindows
				? [
						"bun --cwd server dev",
						"bun --cwd vite dev",
						"bun --cwd apps/checkout dev",
					]
				: [
						"cd server && bun dev",
						"cd vite && bun dev",
						"cd apps/checkout && bun dev",
					];

			if (!skipWorkers) {
				names.splice(1, 0, "workers");
				colors.splice(1, 0, "yellow");
				cmds.splice(
					1,
					0,
					isWindows
						? "bun --cwd server workers:dev"
						: "cd server && bun workers:dev",
				);
			}

			if (isWindows) {
				shellArgs = [
					"bunx",
					"concurrently",
					"-n",
					names.join(","),
					"-c",
					colors.join(","),
					...cmds,
				];
			} else {
				shellArgs = [
					"sh",
					"-c",
					`bunx concurrently -n ${names.join(",")} -c ${colors.join(",")} ${cmds.map((c) => `"${c}"`).join(" ")}`,
				];
			}
		}

		const concurrentlyProc = Bun.spawn(shellArgs, {
			cwd: projectRoot,
			env: {
				...process.env,
				VITE_PORT: VITE_PORT.toString(),
				SERVER_PORT: SERVER_PORT.toString(),
				CHECKOUT_PORT: CHECKOUT_PORT.toString(),
				...(worktreeNum > 1 && {
					CLIENT_URL: `http://localhost:${VITE_PORT}`,
					BETTER_AUTH_URL: `http://localhost:${SERVER_PORT}`,
					VITE_BACKEND_URL: `http://localhost:${SERVER_PORT}`,
					VITE_FRONTEND_URL: `http://localhost:${VITE_PORT}`,
				}),
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

		process.on("SIGINT", () => {
			console.log("\n\n🛑 Shutting down development servers...");
			concurrentlyProc.kill("SIGINT");
		});

		process.on("SIGTERM", () => {
			console.log("\n\n🛑 Shutting down development servers...");
			concurrentlyProc.kill("SIGTERM");
		});

		await concurrentlyProc.exited;
	} catch (error) {
		console.error("Error starting development servers:", error);
		process.exit(1);
	}
}

startDev();