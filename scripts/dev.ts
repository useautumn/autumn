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
const CHAT_PORT = process.env.CHAT_PORT
	? Number.parseInt(process.env.CHAT_PORT, 10)
	: 3099 + portOffset;
const LOCAL_CLIENT_URL = `http://localhost:${VITE_PORT}`;
const LOCAL_SERVER_URL = `http://localhost:${SERVER_PORT}`;
const LOCAL_CHAT_URL = `http://localhost:${CHAT_PORT}`;
const publicTunnelUrl = process.env.NGROK_URL?.replace(/\/$/, "");
const CHAT_URL = process.env.CHAT_URL ?? publicTunnelUrl ?? LOCAL_CHAT_URL;
const SLACK_BOT_URL = process.env.SLACK_BOT_URL ?? publicTunnelUrl ?? CHAT_URL;
const skipWorkers = false;
const isProductionMode = process.argv.includes("--production");

const envFile = process.env.ENV_FILE ?? ".env";
const viteAppEnv = envFile.includes(".env.prod")
	? "prod"
	: envFile.includes(".env.staging")
		? "staging"
		: "dev";
const useLocalAuthUrls = viteAppEnv === "dev" && !isProductionMode;
const localUrl = (value: string | undefined, fallback: string) =>
	value && !value.includes(".useautumn.com") ? value : fallback;
const slackRedirectFromPublicTunnel = publicTunnelUrl
	? `${publicTunnelUrl}/slack/oauth/callback`
	: undefined;
const SLACK_REDIRECT_URI = useLocalAuthUrls
	? (slackRedirectFromPublicTunnel ??
		localUrl(
			process.env.SLACK_REDIRECT_URI,
			`${SLACK_BOT_URL}/slack/oauth/callback`,
		))
	: (process.env.SLACK_REDIRECT_URI ?? `${SLACK_BOT_URL}/slack/oauth/callback`);

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
					ports: [VITE_PORT, SERVER_PORT, CHECKOUT_PORT, CHAT_PORT],
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
			console.log(`Starting worktree ${worktreeNum}...\n`);
		} else if (isProductionMode) {
			console.log("Starting local servers with NODE_ENV=production...\n");
		} else {
			console.log("Starting development servers...\n");
		}

		console.log(`  vite:     http://localhost:${VITE_PORT}`);
		console.log(`  server:   http://localhost:${SERVER_PORT}`);
		console.log(`  checkout: http://localhost:${CHECKOUT_PORT}`);
		console.log(`  leaf:     http://localhost:${CHAT_PORT}/health`);
		console.log(`  mcp:      http://localhost:${CHAT_PORT}/mcp\n`);

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

			names.push("trigger");
			colors.push("cyan");
			// Local Trigger's Bun worker can't resolve the optional Axiom transport.
			const triggerCmd = isWindows
				? "set AXIOM_TOKEN= && bunx trigger.dev dev"
				: "env -u AXIOM_TOKEN bunx trigger.dev dev";
			cmds.push(`"${triggerCmd}"`);

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

			names.push("leaf");
			colors.push("gray");
			cmds.push(
				isWindows
					? `"cd apps/leaf && set PORT=${CHAT_PORT} && bun dev"`
					: `"cd apps/leaf && PORT=${CHAT_PORT} bun dev"`,
			);

			// Stripe CLI webhook tunnel — silently skip if CLI absent.
			// Forwards to the direct localhost port (not portless) so we avoid CA trust issues.
			const stripeAvailable = Bun.spawnSync(["which", "stripe"]).exitCode === 0;
			if (stripeAvailable) {
				const auth = Bun.spawnSync(
					["stripe", "customers", "list", "--limit", "1"],
					{ stdout: "pipe", stderr: "pipe" },
				);
				if (auth.exitCode !== 0) {
					const stderr = new TextDecoder().decode(auth.stderr);
					console.error(
						"\nStripe CLI is installed but not authenticated (or key expired).",
					);
					console.error(
						`  ${stderr.trim().split("\n").slice(-3).join("\n  ")}`,
					);
					console.error("\nRun `stripe login` and try again.\n");
					process.exit(1);
				}
				const forwardUrl = `http://localhost:${SERVER_PORT}/webhooks/connect/sandbox`;
				names.push("stripe");
				colors.push("cyan");
				// --forward-connect-to forwards events from connected accounts;
				// the /webhooks/connect/* endpoint expects Connect-mode events.
				const stripeCmd = `stripe listen --forward-connect-to ${forwardUrl} --skip-verify`;
				cmds.push(isWindows ? `"${stripeCmd}"` : `"${stripeCmd}"`);
			}

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
				CHAT_PORT: CHAT_PORT.toString(),
				MCP_DEBUG_PENDING_ACTIONS: process.env.MCP_DEBUG_PENDING_ACTIONS ?? "1",
				// CMA runs in Anthropic's cloud and can't reach localhost — prefer the
				// public NGROK_URL (proxied to leaf's /mcp) so Slack → CMA works locally.
				MCP_SERVER_URL:
					process.env.MCP_SERVER_URL ??
					process.env.NGROK_URL ??
					`http://localhost:${CHAT_PORT}`,
				CHAT_SERVER_URL:
					process.env.CHAT_SERVER_URL ?? `http://localhost:${CHAT_PORT}`,
				MCP_RESOURCE_URLS:
					process.env.MCP_RESOURCE_URLS ?? `http://localhost:${CHAT_PORT}/mcp`,
				AUTUMN_API_URL: process.env.AUTUMN_API_URL ?? LOCAL_SERVER_URL,
				CHAT_URL,
				SLACK_BOT_URL,
				SLACK_REDIRECT_URI,
				DISCORD_BOT_URL: process.env.DISCORD_BOT_URL ?? LOCAL_CHAT_URL,
				VITE_APP_ENV: viteAppEnv,
				...(useLocalAuthUrls && {
					CLIENT_URL: localUrl(process.env.CLIENT_URL, LOCAL_CLIENT_URL),
					BETTER_AUTH_URL: localUrl(
						process.env.BETTER_AUTH_URL,
						LOCAL_SERVER_URL,
					),
					VITE_BACKEND_URL: localUrl(
						process.env.VITE_BACKEND_URL,
						LOCAL_SERVER_URL,
					),
					VITE_FRONTEND_URL: localUrl(
						process.env.VITE_FRONTEND_URL,
						LOCAL_CLIENT_URL,
					),
				}),
				...(process.env.DB_SCHEMA && { DB_SCHEMA: process.env.DB_SCHEMA }),
				...(worktreeNum > 1 && {
					CLIENT_URL: localUrl(process.env.CLIENT_URL, LOCAL_CLIENT_URL),
					BETTER_AUTH_URL: localUrl(
						process.env.BETTER_AUTH_URL,
						LOCAL_SERVER_URL,
					),
					VITE_BACKEND_URL: localUrl(
						process.env.VITE_BACKEND_URL,
						LOCAL_SERVER_URL,
					),
					VITE_FRONTEND_URL: localUrl(
						process.env.VITE_FRONTEND_URL,
						LOCAL_CLIENT_URL,
					),
					EMULATE_GOOGLE_URL:
						process.env.EMULATE_GOOGLE_URL ??
						"https://google.emulate.localhost",
					STRIPE_WEBHOOK_SKIP_VERIFY: "true",
				}),
			},
			stdout: "inherit",
			stderr: "inherit",
			onExit(
				_proc: unknown,
				exitCode: number | null,
				_signalCode: number | null,
				error?: unknown,
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
