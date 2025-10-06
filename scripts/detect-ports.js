import { exec } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const DEFAULT_VITE_PORT = 3000;
const DEFAULT_SERVER_PORT = 8080;

/**
 * Get the process ID using a specific port
 */
async function getProcessOnPort(port) {
	try {
		const { stdout } = await execAsync(`lsof -ti:${port}`);
		const pid = stdout.trim();
		if (pid) {
			// Get process details
			const { stdout: psOut } = await execAsync(`ps -p ${pid} -o comm=`);
			const processName = psOut.trim();
			return { pid: parseInt(pid), processName };
		}
		return null;
	} catch (error) {
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
	} catch (error) {
		return false;
	}
}

/**
 * Check if a port is available, and optionally kill old dev server processes
 */
async function isPortAvailable(port, killIfDevServer = true) {
	return new Promise((resolve) => {
		const server = net.createServer();

		server.once("error", async (err) => {
			if (err.code === "EADDRINUSE") {
				// Port is in use - check what's using it
				if (killIfDevServer) {
					const processInfo = await getProcessOnPort(port);
					if (processInfo) {
						const { pid, processName } = processInfo;
						// Check if it's likely an old dev server process (bun, node, vite)
						const isDevProcess =
							processName.includes("bun") ||
							processName.includes("node") ||
							processName.includes("vite");

						if (isDevProcess) {
							console.log(
								`⚠️  Port ${port} is in use by ${processName} (PID: ${pid})`,
							);
							console.log(`   Attempting to kill old dev server process...`);
							const killed = await killProcess(pid);
							if (killed) {
								console.log(`   ✅ Killed process ${pid}`);
								// Wait a bit for the port to be released
								await new Promise((r) => setTimeout(r, 500));
								resolve(true);
								return;
							} else {
								console.log(`   ❌ Failed to kill process ${pid}`);
							}
						} else {
							console.log(
								`⚠️  Port ${port} is in use by ${processName} (PID: ${pid})`,
							);
							console.log(`   Skipping - not a dev server process`);
						}
					}
				}
				resolve(false);
			} else {
				resolve(false);
			}
		});

		server.once("listening", () => {
			server.close();
			resolve(true);
		});

		server.listen(port);
	});
}

/**
 * Find the next available port starting from the given port
 */
async function findAvailablePort(startPort, maxAttempts = 10) {
	for (let i = 0; i < maxAttempts; i++) {
		const port = startPort + i;
		if (await isPortAvailable(port)) {
			return port;
		}
	}
	throw new Error(`Could not find available port starting from ${startPort}`);
}

/**
 * Update or create .env file with the detected ports
 */
function updateEnvFile(filePath, updates) {
	let content = "";

	if (fs.existsSync(filePath)) {
		content = fs.readFileSync(filePath, "utf-8");
	}

	// Parse existing env file
	const lines = content.split("\n");
	const envMap = new Map();

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#")) {
			const [key, ...valueParts] = trimmed.split("=");
			if (key) {
				envMap.set(key.trim(), valueParts.join("="));
			}
		}
	}

	// Update with new values
	for (const [key, value] of Object.entries(updates)) {
		envMap.set(key, value);
	}

	// Rebuild content preserving comments and empty lines
	const newLines = [];
	const processedKeys = new Set();

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			newLines.push(line);
			continue;
		}

		const [key] = trimmed.split("=");
		if (key && envMap.has(key.trim())) {
			processedKeys.add(key.trim());
			newLines.push(`${key.trim()}=${envMap.get(key.trim())}`);
		} else {
			newLines.push(line);
		}
	}

	// Add new keys that weren't in the original file
	for (const [key, value] of envMap.entries()) {
		if (!processedKeys.has(key)) {
			newLines.push(`${key}=${value}`);
		}
	}

	fs.writeFileSync(filePath, newLines.join("\n"));
}

async function detectAndSetPorts() {
	console.log(
		`🔍 Checking default ports (Frontend: ${DEFAULT_VITE_PORT}, Backend: ${DEFAULT_SERVER_PORT})...`,
	);

	// First try default ports and kill old dev servers if needed
	const viteAvailable = await isPortAvailable(DEFAULT_VITE_PORT, true);
	const serverAvailable = await isPortAvailable(DEFAULT_SERVER_PORT, true);

	// If still not available after cleanup, find alternative ports
	const vitePort = viteAvailable
		? DEFAULT_VITE_PORT
		: await findAvailablePort(DEFAULT_VITE_PORT + 1);
	const serverPort = serverAvailable
		? DEFAULT_SERVER_PORT
		: await findAvailablePort(DEFAULT_SERVER_PORT + 1);

	console.log(`\n✅ Using ports:`);
	console.log(
		`   Frontend: ${vitePort}${vitePort !== DEFAULT_VITE_PORT ? " (alternative)" : ""}`,
	);
	console.log(
		`   Backend: ${serverPort}${serverPort !== DEFAULT_SERVER_PORT ? " (alternative)" : ""}`,
	);

	// Get root directory (parent of scripts folder)
	const rootDir = path.dirname(new URL(import.meta.url).pathname);
	const projectRoot = path.join(rootDir, "..");

	// Update vite .env
	const viteEnvPath = path.join(projectRoot, "vite", ".env");
	updateEnvFile(viteEnvPath, {
		VITE_FRONTEND_URL: `http://localhost:${vitePort}`,
		VITE_BACKEND_URL: `http://localhost:${serverPort}`,
	});

	// Update server .env
	const serverEnvPath = path.join(projectRoot, "server", ".env");
	updateEnvFile(serverEnvPath, {
		BETTER_AUTH_URL: `http://localhost:${serverPort}`,
		CLIENT_URL: `http://localhost:${vitePort}`,
	});

	// Set environment variables for current process
	process.env.VITE_PORT = vitePort.toString();
	process.env.SERVER_PORT = serverPort.toString();
	process.env.VITE_FRONTEND_URL = `http://localhost:${vitePort}`;
	process.env.VITE_BACKEND_URL = `http://localhost:${serverPort}`;
	process.env.BETTER_AUTH_URL = `http://localhost:${serverPort}`;
	process.env.CLIENT_URL = `http://localhost:${vitePort}`;

	console.log(`✅ Environment variables updated\n`);

	return { vitePort, serverPort };
}

// Only run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	detectAndSetPorts()
		.then(({ vitePort, serverPort }) => {
			console.log(`\n🚀 Ready to start development servers`);
			process.exit(0);
		})
		.catch((error) => {
			console.error("Error detecting ports:", error);
			process.exit(1);
		});
}

export {
	detectAndSetPorts,
	findAvailablePort,
	isPortAvailable,
	getProcessOnPort,
	killProcess,
};
