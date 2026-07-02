#!/usr/bin/env bun
/**
 * cloud-tunnel.ts — public tunnel + Stripe Connect webhook registration for the
 * Cursor Cloud VM (worktree #1 / local dev).
 *
 * Cursor Cloud VMs are isolated — there is no inbound public URL that Stripe can
 * POST to. So to get Stripe webhooks into the local server we open an ngrok
 * tunnel to the server (`:8080`) and register a platform Connect webhook
 * endpoint pointing at the tunnel's public URL (same shape as server/register.ts).
 *
 * Secrets (provided via Cursor Cloud secrets / process.env):
 *   - NGROK_AUTHTOKEN            (required) — ngrok *agent* token; the SDK uses it
 *                                 to open the tunnel. NOT the same as NGROK_API_KEY.
 *   - NGROK_API_KEY             (optional) — ngrok *management* API key; if set we
 *                                 reserve a stable domain (released on `down`),
 *                                 otherwise we use an ephemeral ngrok URL.
 *   - STRIPE_SANDBOX_SECRET_KEY (optional) — platform secret key; if set we register
 *                                 the Connect webhook endpoint at the tunnel URL.
 *
 * Usage:
 *   bun scripts/setup/cloud-tunnel.ts up     # open tunnel + register webhook (stays alive)
 *   bun scripts/setup/cloud-tunnel.ts down   # release reserved domain + webhook endpoint
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import ngrok from "@ngrok/ngrok";
import Stripe from "stripe";
import {
	deleteReservedDomain,
	ensureReservedDomain,
	ngrokApiAvailable,
} from "../dw/helpers/ngrok.ts";
import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "../../server/src/external/stripe/common/stripeConstants.ts";

const REPO_ROOT = join(new URL(".", import.meta.url).pathname, "..", "..");
const SERVER_ENV = join(REPO_ROOT, "server", ".env");
const STATE_DIR = join(homedir(), ".autumn-agent");
const STATE_FILE = join(STATE_DIR, "tunnel-state.json");
const SERVER_PORT = Number(process.env.SERVER_PORT ?? 8080);
const WEBHOOK_PATH = "/webhooks/connect/sandbox";

const log = (msg: string) => console.log(`[cloud-tunnel] ${msg}`);
const fatal = (msg: string): never => {
	console.error(`[cloud-tunnel] ERROR: ${msg}`);
	process.exit(1);
};

type State = {
	publicUrl?: string;
	reservedDomainId?: string;
	webhookEndpointId?: string;
	pid?: number;
};

const loadState = (): State => {
	if (!existsSync(STATE_FILE)) return {};
	try {
		return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as State;
	} catch {
		return {};
	}
};
const saveState = (s: State): void => {
	mkdirSync(STATE_DIR, { recursive: true });
	writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
};

/** Merge KEY=VALUE pairs into server/.env, preserving other lines. */
const mergeServerEnv = (managed: Record<string, string>): void => {
	const existing = existsSync(SERVER_ENV)
		? readFileSync(SERVER_ENV, "utf-8")
		: "";
	const managedKeys = new Set(Object.keys(managed));
	const seen = new Set<string>();
	const out: string[] = [];
	for (const line of existing.split(/\r?\n/)) {
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
		if (m && managedKeys.has(m[1])) {
			out.push(`${m[1]}=${managed[m[1]]}`);
			seen.add(m[1]);
		} else {
			out.push(line);
		}
	}
	for (const [k, v] of Object.entries(managed)) {
		if (!seen.has(k)) out.push(`${k}=${v}`);
	}
	while (out.length > 0 && out[out.length - 1] === "") out.pop();
	mkdirSync(dirname(SERVER_ENV), { recursive: true });
	writeFileSync(SERVER_ENV, `${out.join("\n")}\n`);
};

const allEvents = [
	...new Set([...MAIN_STRIPE_EVENT_TYPES, ...SYNC_STRIPE_EVENT_TYPES]),
] as Stripe.WebhookEndpointCreateParams.EnabledEvent[];

/**
 * Register (idempotently) a platform Connect webhook at the tunnel URL. Deletes
 * stale autumn connect endpoints first so we don't pile up against Stripe's
 * endpoint cap across restarts. Returns the new endpoint's id + signing secret.
 */
const registerStripeWebhook = async (
	publicUrl: string,
): Promise<{ id: string; secret?: string }> => {
	const stripe = new Stripe(process.env.STRIPE_SANDBOX_SECRET_KEY as string);
	const url = `${publicUrl}${WEBHOOK_PATH}`;

	for await (const ep of stripe.webhookEndpoints.list({ limit: 100 })) {
		if (ep.url.endsWith(WEBHOOK_PATH)) {
			await stripe.webhookEndpoints.del(ep.id).catch(() => {});
			log(`removed stale webhook endpoint ${ep.id} (${ep.url})`);
		}
	}

	const created = await stripe.webhookEndpoints.create({
		url,
		enabled_events: allEvents,
		connect: true,
	});
	log(`registered Stripe Connect webhook ${created.id} -> ${url}`);
	return { id: created.id, secret: created.secret ?? undefined };
};

const up = async (): Promise<void> => {
	const authtoken = process.env.NGROK_AUTHTOKEN;
	if (!authtoken) {
		fatal(
			"NGROK_AUTHTOKEN is not set. Add it in Cursor Cloud secrets (ngrok agent " +
				"authtoken from https://dashboard.ngrok.com/get-started/your-authtoken). " +
				"Note: this is the agent authtoken, NOT the NGROK_API_KEY management key.",
		);
	}

	const state: State = { pid: process.pid };

	let domain: string | undefined;
	if (ngrokApiAvailable()) {
		const reserved = await ensureReservedDomain(1, REPO_ROOT);
		domain = reserved.domain;
		state.reservedDomainId = reserved.id;
	} else {
		log("NGROK_API_KEY not set — using an ephemeral ngrok URL (changes each run)");
	}

	log(`opening ngrok tunnel -> localhost:${SERVER_PORT}${domain ? ` (domain ${domain})` : ""}`);
	const listener = await ngrok.forward({
		addr: SERVER_PORT,
		authtoken,
		...(domain ? { domain } : {}),
	});
	const publicUrl = listener.url();
	if (!publicUrl) fatal("ngrok did not return a public URL");
	state.publicUrl = publicUrl as string;
	log(`public URL: ${publicUrl}`);

	// The server reads these from server/.env at boot. skip-verify lets webhooks
	// flow locally even though the Connect endpoint's signing secret rotates each
	// time we re-register; we still write the fresh secret below for correctness.
	mergeServerEnv({
		STRIPE_WEBHOOK_URL: publicUrl as string,
		NGROK_URL: publicUrl as string,
		STRIPE_WEBHOOK_SKIP_VERIFY: "true",
	});

	if (process.env.STRIPE_SANDBOX_SECRET_KEY) {
		try {
			const { id, secret } = await registerStripeWebhook(publicUrl as string);
			state.webhookEndpointId = id;
			if (secret) mergeServerEnv({ STRIPE_SANDBOX_WEBHOOK_SECRET: secret });
		} catch (err) {
			log(
				`Stripe webhook registration failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	} else {
		log("STRIPE_SANDBOX_SECRET_KEY not set — tunnel is up but no webhook registered");
	}

	saveState(state);
	log("tunnel ready — leave this process running. Release with: bun scripts/setup/cloud-tunnel.ts down");

	const shutdown = async () => {
		try {
			await listener.close();
		} catch {}
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
	await new Promise<void>(() => {}); // stay alive
};

const down = async (): Promise<void> => {
	const state = loadState();

	if (state.webhookEndpointId && process.env.STRIPE_SANDBOX_SECRET_KEY) {
		const stripe = new Stripe(process.env.STRIPE_SANDBOX_SECRET_KEY);
		await stripe.webhookEndpoints
			.del(state.webhookEndpointId)
			.then(() => log(`deleted Stripe webhook endpoint ${state.webhookEndpointId}`))
			.catch((e) => log(`webhook delete skipped: ${e?.message ?? e}`));
	}
	if (state.reservedDomainId) {
		await deleteReservedDomain(state.reservedDomainId);
	}
	if (state.pid) {
		try {
			process.kill(state.pid, "SIGTERM");
			log(`stopped tunnel process ${state.pid}`);
		} catch {}
	}
	saveState({});
	log("tunnel torn down");
};

const cmd = process.argv[2] ?? "up";
if (cmd === "up") await up();
else if (cmd === "down") await down();
else fatal(`unknown command: ${cmd} (use: up | down)`);
