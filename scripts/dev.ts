import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isCloudAgent } from "@autumn/env";
import { assertBalanceWorkerPortAvailable } from "./devServices/assertBalanceWorkerPortAvailable.ts";
import { balanceWorkerDevConfig } from "./devServices/balanceWorkerDevConfig.ts";
import {
	resolveAtomDeploymentPrefix,
	resolveTriggerDevBranch,
} from "./triggerDevBranch.ts";

function spawnTriggerDevBranchReaper({
	projectRoot,
	branch,
	watchPid,
}: {
	projectRoot: string;
	branch: string;
	watchPid: number;
}): void {
	const reaperPath = join(
		dirname(fileURLToPath(import.meta.url)),
		"triggerDevBranchReaper.ts",
	);
	const proc = Bun.spawn(
		[
			"bun",
			reaperPath,
			"--watch-pid",
			String(watchPid),
			"--branch",
			branch,
			"--project-root",
			projectRoot,
		],
		{
			cwd: projectRoot,
			detached: true,
			stdio: ["ignore", "ignore", "ignore"],
			env: process.env as Record<string, string>,
		},
	);
	proc.unref();
}

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
const EVE_PORT = process.env.EVE_PORT
	? Number.parseInt(process.env.EVE_PORT, 10)
	: 3999 + portOffset;
const ATOM_PORT = 8086 + portOffset;
const ATOM_PEER_PORT = 8087 + portOffset;
const ATOM_URL = `http://127.0.0.1:${ATOM_PORT}`;
const ATOM_ADMIN_TOKEN = `atom_admin_${randomBytes(32).toString("base64url")}`;
const LOCAL_CLIENT_URL = `http://localhost:${VITE_PORT}`;
const LOCAL_SERVER_URL = `http://localhost:${SERVER_PORT}`;
const LOCAL_CHAT_URL = `http://localhost:${CHAT_PORT}`;
const LOCAL_EVE_URL = `http://localhost:${EVE_PORT}`;
const EVE_SERVER_URL = process.env.EVE_SERVER_URL ?? LOCAL_EVE_URL;
const EVE_INTERNAL_AUTH_TOKEN =
	process.env.EVE_INTERNAL_AUTH_TOKEN ?? "local-eve-internal-token";
const AUTUMN_PUBLIC_API_URL =
	process.env.AUTUMN_PUBLIC_API_URL ?? LOCAL_SERVER_URL;
const publicApiUrl = AUTUMN_PUBLIC_API_URL.replace(/\/$/, "");
const CHAT_URL = process.env.CHAT_URL ?? publicApiUrl;
const SLACK_BOT_URL = process.env.SLACK_BOT_URL ?? publicApiUrl;
const TRIGGER_API_URL =
	(process.env.TRIGGER_API_URL ?? "https://api.trigger.dev")
		.trim()
		.replace(/\/$/, "") || "https://api.trigger.dev";
const skipWorkers = false;
const isProductionMode = process.argv.includes("--production");

const envFile = process.env.ENV_FILE ?? ".env";
const viteAppEnv = envFile.includes(".env.prod")
	? "prod"
	: envFile.includes(".env.staging")
		? "staging"
		: "dev";
const useLocalAuthUrls = viteAppEnv === "dev" && !isProductionMode;
const launchBalanceWorker = useLocalAuthUrls && !isCloudAgent();
const balanceWorkerEnv = balanceWorkerDevConfig({
	worktreeNum,
	runtimeEnv: process.env,
});
const LOCAL_MISC_CACHE_URL = "redis://localhost:6379";
const LOCAL_CACHE_V2_URL = "redis://localhost:6380";
const useLocalMiscCache =
	viteAppEnv === "dev" &&
	!isProductionMode &&
	worktreeNum === 1 &&
	!process.env.CACHE_V2_DRAGONFLY_URL;
const localUrl = (value: string | undefined, fallback: string) =>
	value && !value.includes(".useautumn.com") ? value : fallback;
const AUTUMN_API_URL = useLocalAuthUrls
	? localUrl(process.env.AUTUMN_API_URL, LOCAL_SERVER_URL)
	: (process.env.AUTUMN_API_URL ?? LOCAL_SERVER_URL);
const slackRedirectFromPublicApi = publicApiUrl
	? `${publicApiUrl}/slack/oauth/callback`
	: undefined;
const SLACK_REDIRECT_URI = useLocalAuthUrls
	? (slackRedirectFromPublicApi ??
		localUrl(
			process.env.SLACK_REDIRECT_URI,
			`${SLACK_BOT_URL}/slack/oauth/callback`,
		))
	: (process.env.SLACK_REDIRECT_URI ?? `${SLACK_BOT_URL}/slack/oauth/callback`);

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
	if (launchBalanceWorker && !serverOnly) {
		await assertBalanceWorkerPortAvailable({
			port: Number(balanceWorkerEnv.BALANCE_WORKER_PORT),
		});
	}

	const triggerDevBranch = resolveTriggerDevBranch({
		projectRoot,
		worktreeNum,
	});
	process.env.TRIGGER_DEV_BRANCH = triggerDevBranch;
	const atomDeploymentPrefix = resolveAtomDeploymentPrefix({ projectRoot });
	process.env.ATOM_DEPLOYMENT_PREFIX = atomDeploymentPrefix;

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
				console.log("Cleaning up local dev ports...\n");
				killPorts({
					ports: [
						VITE_PORT,
						SERVER_PORT,
						CHECKOUT_PORT,
						CHAT_PORT,
						EVE_PORT,
						ATOM_PORT,
					],
				});
			}

			const viteCachePath = join(projectRoot, "vite", "node_modules", ".vite");
			if (existsSync(viteCachePath) && process.env.CAPY_DEV !== "1") {
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
		console.log(`  eve:      ${EVE_SERVER_URL}/eve/v1/info`);
		console.log(`  mcp:      http://localhost:${CHAT_PORT}/mcp\n`);

		const isWindows = process.platform === "win32";

		let shellArgs: string[];
		if (serverOnly) {
			if (isWindows) {
				const serverCmd = `cd server && set SERVER_PORT=${SERVER_PORT} && set TRIGGER_DEV_BRANCH=${triggerDevBranch} && set ATOM_DEPLOYMENT_PREFIX=${atomDeploymentPrefix} && bun start`;
				const workersCmd = `cd server && set TRIGGER_DEV_BRANCH=${triggerDevBranch} && bun workers`;
				shellArgs = [
					"cmd",
					"/c",
					`bunx concurrently -n server,workers -c green,yellow "${serverCmd}" "${workersCmd}"`,
				];
			} else {
				shellArgs = [
					"sh",
					"-c",
					`bunx concurrently -n server,workers -c green,yellow "cd server && SERVER_PORT=${SERVER_PORT} TRIGGER_DEV_BRANCH=${triggerDevBranch} ATOM_DEPLOYMENT_PREFIX=${atomDeploymentPrefix} bun start" "cd server && TRIGGER_DEV_BRANCH=${triggerDevBranch} bun workers"`,
				];
			}
		} else {
			const names = ["server"];
			const colors = ["green"];
			const serverScript = isProductionMode ? "dev:prod" : "dev";
			const workersScript = isProductionMode ? "workers:prod" : "workers:dev";
			const cmds = [
				isWindows
					? `"cd server && set SERVER_PORT=${SERVER_PORT} && set TRIGGER_DEV_BRANCH=${triggerDevBranch} && set ATOM_DEPLOYMENT_PREFIX=${atomDeploymentPrefix} && bun ${serverScript}"`
					: `"cd server && SERVER_PORT=${SERVER_PORT} TRIGGER_DEV_BRANCH=${triggerDevBranch} ATOM_DEPLOYMENT_PREFIX=${atomDeploymentPrefix} bun ${serverScript}"`,
			];

			if (launchBalanceWorker) {
				names.push("balance-worker");
				colors.push("blueBright");
				cmds.push('"cd apps/balance-worker && bun dev:restart"');
				console.log(
					`  balance-worker: ${balanceWorkerEnv.BALANCE_WORKER_ENDPOINT}/health (liveness only)`,
				);
			}

			if (launchBalanceWorker) {
				names.push("herald");
				colors.push("magentaBright");
				cmds.push('"cd apps/herald && bun dev"');
			}

			if (launchBalanceWorker) {
				names.push("atom");
				colors.push("gray");
				cmds.push('"cd apps/atom && bun dev"');
			}

			if (!skipWorkers) {
				names.push("workers");
				colors.push("yellow");
				cmds.push(
					isWindows
						? `"cd server && set TRIGGER_DEV_BRANCH=${triggerDevBranch} && bun ${workersScript}"`
						: `"cd server && TRIGGER_DEV_BRANCH=${triggerDevBranch} bun ${workersScript}"`,
				);
			}

			names.push("trigger");
			colors.push("cyan");
			console.log(`Trigger DEV branch: ${triggerDevBranch}\n`);
			spawnTriggerDevBranchReaper({
				projectRoot,
				branch: triggerDevBranch,
				watchPid: process.pid,
			});
			// Local Trigger's Bun worker can't resolve the optional Axiom transport.
			// mismatch the pinned @trigger.dev/* packages.
			const triggerCmd = isWindows
				? `set AXIOM_TOKEN= && bun run trigger dev --branch ${triggerDevBranch} --api-url "%TRIGGER_API_URL%"`
				: `env -u AXIOM_TOKEN bun run trigger dev --branch ${triggerDevBranch} --api-url "$TRIGGER_API_URL"`;
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

			const skipEve = isCloudAgent();
			if (!skipEve) {
				names.push("eve");
				colors.push("white");
				cmds.push(
					isWindows
						? `"cd apps/leaf && bun run eve dev --no-ui --port ${EVE_PORT}"`
						: `"cd apps/leaf && bun run eve dev --no-ui --port ${EVE_PORT}"`,
				);
			} else {
				console.error("CLOUD_AGENT=1 — skipping eve\n");
			}
			names.push("leaf");
			colors.push("gray");
			cmds.push(
				isWindows
					? `"cd apps/leaf && set PORT=${CHAT_PORT} && bun dev"`
					: `"cd apps/leaf && PORT=${CHAT_PORT} bun dev"`,
			);

			// Stripe CLI webhook tunnel — skip if CLI absent.
			const stripeBin = existsSync("/usr/local/bin/stripe")
				? "/usr/local/bin/stripe"
				: Bun.spawnSync(["which", "stripe"]).exitCode === 0
					? "stripe"
					: null;
			const stripeKey = process.env.STRIPE_SANDBOX_SECRET_KEY?.trim();
			const cloudAgent = isCloudAgent();
			if (stripeBin) {
				const startListen = () => {
					const forwardUrl = `http://localhost:${SERVER_PORT}/webhooks/connect/sandbox`;
					names.push("stripe");
					colors.push("cyan");
					// the /webhooks/connect/* endpoint expects Connect-mode events.
					const stripeCmd = `${stripeBin} listen --forward-connect-to ${forwardUrl} --skip-verify`;
					cmds.push(isWindows ? `"${stripeCmd}"` : `"${stripeCmd}"`);
					console.error(`stripe listen → ${forwardUrl}`);
				};
				if (stripeKey) {
					startListen();
				} else {
					const stripeEnv = {
						...(process.env as Record<string, string>),
					};
					const auth = Bun.spawnSync(
						[stripeBin, "customers", "list", "--limit", "1"],
						{ stdout: "pipe", stderr: "pipe", env: stripeEnv },
					);
					if (auth.exitCode === 0) {
						startListen();
					} else if (cloudAgent) {
						console.error(
							"CLOUD_AGENT=1 — no STRIPE_SANDBOX_SECRET_KEY; skipping stripe listen. Add Infisical machine-identity Runtime Secrets so bun dw run can attach webhooks.\n",
						);
					} else {
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
				}
			} else if (cloudAgent) {
				console.error(
					"CLOUD_AGENT=1 — Stripe CLI not installed; skipping stripe listen.\n",
				);
			}

			const onlyServices = process.env.DEV_SERVICES?.split(",").filter(Boolean);
			if (onlyServices?.includes("cron")) {
				names.push("cron");
				colors.push("red");
				cmds.push('"cd server && bun src/cron.ts"');
			}
			if (onlyServices) {
				const kept = names.flatMap((name, i) =>
					onlyServices.includes(name) ? [i] : [],
				);
				names.splice(0, names.length, ...kept.map((i) => names[i]));
				colors.splice(0, colors.length, ...kept.map((i) => colors[i]));
				cmds.splice(0, cmds.length, ...kept.map((i) => cmds[i]));
			}

			shellArgs = [
				"bunx",
				"concurrently",
				"-n",
				names.join(","),
				"-c",
				colors.join(","),
				...cmds.map((cmd) => cmd.slice(1, -1)),
			];
		}

		const spawnEnv: Record<string, string> = {
			...process.env,
			...(launchBalanceWorker && balanceWorkerEnv),
			TRIGGER_DEV_BRANCH: triggerDevBranch,
			TRIGGER_API_URL,
			...(process.env.STRIPE_SANDBOX_SECRET_KEY
				? { STRIPE_API_KEY: process.env.STRIPE_SANDBOX_SECRET_KEY }
				: {}),
			VITE_PORT: VITE_PORT.toString(),
			SERVER_PORT: SERVER_PORT.toString(),
			CHECKOUT_PORT: CHECKOUT_PORT.toString(),
			CHAT_PORT: CHAT_PORT.toString(),
			EVE_PORT: EVE_PORT.toString(),
			EVE_SERVER_URL,
			EVE_INTERNAL_AUTH_TOKEN,
			ATOM_MODE: "multi_tenant",
			ATOM_TOKEN_HASH: createHash("sha256")
				.update(ATOM_ADMIN_TOKEN)
				.digest("hex"),
			ATOM_SLOT_COUNT: "2",
			ATOM_PORT: ATOM_PORT.toString(),
			ATOM_PEER_PORT: ATOM_PEER_PORT.toString(),
			ATOM_PEER_SECRET: randomBytes(32).toString("hex"),
			ATOM_DATA_DIR: join(projectRoot, ".data", "atom"),
			ATOM_URL,
			ATOM_ADMIN_TOKEN,
			MCP_DEBUG_PENDING_ACTIONS: process.env.MCP_DEBUG_PENDING_ACTIONS ?? "1",
			MCP_SERVER_URL: process.env.MCP_SERVER_URL ?? AUTUMN_PUBLIC_API_URL,
			CHAT_SERVER_URL:
				process.env.CHAT_SERVER_URL ?? `http://localhost:${CHAT_PORT}`,
			MCP_RESOURCE_URLS:
				process.env.MCP_RESOURCE_URLS ?? `http://localhost:${CHAT_PORT}/mcp`,
			AUTUMN_API_URL,
			AUTUMN_PUBLIC_API_URL,
			CHAT_URL,
			SLACK_BOT_URL,
			SLACK_REDIRECT_URI,
			DISCORD_BOT_URL: process.env.DISCORD_BOT_URL ?? LOCAL_CHAT_URL,
			VITE_APP_ENV: viteAppEnv,
			VITE_WORKTREE_NUM: String(worktreeNum),
			...(useLocalAuthUrls && {
				...(!isCloudAgent() && {
					KAFKA_BROKERS: process.env.KAFKA_BROKERS ?? "127.0.0.1:19092",
					KAFKA_AUTH_MODE: process.env.KAFKA_AUTH_MODE ?? "none",
				}),
				CLIENT_URL: localUrl(process.env.CLIENT_URL, LOCAL_CLIENT_URL),
				VITE_BACKEND_URL: localUrl(
					process.env.VITE_BACKEND_URL,
					LOCAL_SERVER_URL,
				),
				VITE_FRONTEND_URL: localUrl(
					process.env.VITE_FRONTEND_URL,
					LOCAL_CLIENT_URL,
				),
			}),
			...(useLocalMiscCache && {
				MISC_CACHE_DRAGONFLY_PUBLIC_URL: LOCAL_MISC_CACHE_URL,
				CACHE_V2_DRAGONFLY_URL: LOCAL_CACHE_V2_URL,
				CACHE_V2_DRAGONFLY_PUBLIC_URL: LOCAL_CACHE_V2_URL,
				REDIS_URL: LOCAL_MISC_CACHE_URL,
			}),
			...(process.env.DB_SCHEMA && { DB_SCHEMA: process.env.DB_SCHEMA }),
			WORKFLOW_QUEUE_NAMESPACE:
				process.env.WORKFLOW_QUEUE_NAMESPACE ??
				`local_${process.env.USER ?? "dev"}`,
			...(worktreeNum > 1 && {
				CLIENT_URL: localUrl(process.env.CLIENT_URL, LOCAL_CLIENT_URL),
				VITE_BACKEND_URL: localUrl(
					process.env.VITE_BACKEND_URL,
					LOCAL_SERVER_URL,
				),
				VITE_FRONTEND_URL: localUrl(
					process.env.VITE_FRONTEND_URL,
					LOCAL_CLIENT_URL,
				),
				EMULATE_GOOGLE_URL:
					process.env.EMULATE_GOOGLE_URL ?? "https://google.emulate.localhost",
				STRIPE_WEBHOOK_SKIP_VERIFY: "true",
			}),
		};
		if (useLocalMiscCache) {
			delete spawnEnv.MISC_CACHE_DRAGONFLY_PRIVATE_URL;
		}

		const concurrentlyProc = Bun.spawn(shellArgs, {
			cwd: projectRoot,
			env: spawnEnv,
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
