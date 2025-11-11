import { exec, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const VITE_PORT = 3000;
const SERVER_PORT = 8080;

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

/**
 * Get the process info using a specific port
 */
async function getProcessOnPort(port) {
	try {
		const { stdout } = await execAsync(`lsof -ti:${port}`);
		const pid = stdout.trim();
		if (pid) {
			const { stdout: psOut } = await execAsync(`ps -p ${pid} -o comm=`);
			const processName = psOut.trim();
			return { pid: parseInt(pid), processName };
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Kill a process by PID
 */
async function killProcess(pid) {
	try {
		await execAsync(`kill -9 ${pid}`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Prompt user for confirmation
 */
function promptUser(question) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
		});
	});
}

/**
 * Check and kill processes on ports 3000 and 8080
 */
async function handlePorts() {
	const viteProcess = await getProcessOnPort(VITE_PORT);
	const serverProcess = await getProcessOnPort(SERVER_PORT);

	const processesToKill = [];
	if (viteProcess) processesToKill.push({ port: VITE_PORT, ...viteProcess });
	if (serverProcess)
		processesToKill.push({ port: SERVER_PORT, ...serverProcess });

	if (processesToKill.length === 0) {
		console.log("✅ Ports 3000 and 8080 are available\n");
		return;
	}

	console.log("\n⚠️  Found processes on required ports:");
	for (const proc of processesToKill) {
		console.log(`   Port ${proc.port}: ${proc.processName} (PID: ${proc.pid})`);
	}

	const shouldKill = await promptUser(
		"\nKill these processes and continue? (y/n): ",
	);

	if (!shouldKill) {
		console.log("❌ Aborted by user");
		process.exit(0);
	}

	console.log("\n🔨 Killing processes...");
	for (const proc of processesToKill) {
		const killed = await killProcess(proc.pid);
		if (killed) {
			console.log(`   ✅ Killed process ${proc.pid} on port ${proc.port}`);
		} else {
			console.log(
				`   ❌ Failed to kill process ${proc.pid} on port ${proc.port}`,
			);
		}
	}

	// Wait for ports to be released
	await new Promise((r) => setTimeout(r, 500));
	console.log("");
}

async function startDev() {
	try {
		// Check if using remote backend (api.useautumn.com)
		const rootDir = path.dirname(new URL(import.meta.url).pathname);
		const projectRoot = path.join(rootDir, "..");
		const viteEnvPath = path.join(projectRoot, "vite", ".env");
		const backendUrl =
			process.env.VITE_BACKEND_URL ||
			getEnvVariable(viteEnvPath, "VITE_BACKEND_URL");
		const isUsingRemoteBackend = backendUrl?.includes("api.useautumn.com");

		if (isUsingRemoteBackend) {
			console.log("\n🌐 Using remote backend (api.useautumn.com)");
			console.log("⏭️  Skipping port cleanup...\n");
		} else {
			// Port cleanup disabled (detection is unreliable)
			console.log("⏭️  Skipping port cleanup...\n");
			// await handlePorts();
		}

		// Clear Vite cache to prevent dep optimization issues
		const viteCachePath = path.join(
			projectRoot,
			"vite",
			"node_modules",
			".vite",
		);
		if (fs.existsSync(viteCachePath)) {
			console.log("🧹 Clearing Vite cache...\n");
			fs.rmSync(viteCachePath, { recursive: true, force: true });
		}

		console.log("🚀 Starting development servers in watch mode...\n");

		// Start server, workers, and vite (they'll use the shared package source files directly)
		const concurrentlyCmd = spawn(
			"bunx",
			[
				"concurrently",
				"-n",
				"server,workers,vite",
				"-c",
				"green,yellow,blue",
				`"cd server && SERVER_PORT=${SERVER_PORT} bun dev"`,
				`"cd server && bun workers:dev"`,
				`"cd vite && VITE_PORT=${VITE_PORT} bun dev"`,
			],
			{
				stdio: "inherit",
				shell: true,
				env: {
					...process.env,
					VITE_PORT: VITE_PORT.toString(),
					SERVER_PORT: SERVER_PORT.toString(),
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
