/**
 * Orchestrator-side helpers for the Stripe Connect webhook INGRESS (plan §6a / §9 / §9a).
 *
 * The ingress replaces the per-worker Connect webhook (Stripe caps webhook
 * endpoints at 16/account): the orchestrator stands up ONE lightweight ingress
 * sandbox running `scripts/tw/ingress/server.mjs`, registers ONE shared platform
 * Connect webhook pointed at it, and pushes each worker's `{ accountId → workerUrl }`
 * mapping to it as workers come up. Stripe → the one Connect webhook → ingress →
 * the owning worker, routed by `event.account`. Full per-worker delivery isolation
 * AND no 16-worker cap.
 *
 * Unlike the worker sandboxes (forked from the warm parent), the ingress sandbox
 * is created fresh from the same git source — it only runs a node http server, so
 * it needs NO build-base (no µVM services). It is a RECORDED sandbox, so the
 * existing teardown sandbox-deletion loop tears it down.
 */

import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import chalk from "chalk";
import { INGRESS_PORT, TW_ENV, VERCEL_RUNTIME, WORKER_TIMEOUT_MS } from "../constants.ts";
import { resolveGitSource } from "../commands/run.ts";
import { getPublicUrl, isSandboxStreamClosed } from "./vercel.ts";

/** Path to the ingress http server, relative to the in-sandbox repo root. */
const INGRESS_SCRIPT = "scripts/tw/ingress/server.mjs";

/** The in-sandbox repo root (matches run.ts's SANDBOX_REPO_ROOT default). */
const SANDBOX_REPO_ROOT = process.env.TW_SANDBOX_REPO_ROOT ?? "/vercel/sandbox";

/** How long to wait for the ingress `/health` to come up after boot. */
const INGRESS_HEALTH_TIMEOUT_MS = 90_000;
/** Delay between `/health` polls. */
const INGRESS_HEALTH_POLL_MS = 1500;

const HTTP_OK = 200;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const log = (message: string): void => {
	console.log(chalk.cyan(`[tw] ${message}`));
};

export type CreateIngressResult = {
	sandbox: Sandbox;
	publicUrl: string;
	token: string;
};

/**
 * Stand up the ingress sandbox: create a lightweight node24 sandbox from the same
 * git source/ref (NO build-base — it only runs the http server), launch the
 * ingress server detached, and poll `/health` until it's up. Returns the sandbox
 * (record it for teardown), its public URL (the Connect webhook target), and the
 * generated INGRESS_TOKEN that authenticates map writes.
 */
export const createIngress = async ({
	owner,
	runId,
	ref,
	signal,
}: {
	owner: string;
	runId: string;
	ref: string;
	signal: AbortSignal;
}): Promise<CreateIngressResult> => {
	const name = `tw-ingress-${runId}`;
	const token = randomUUID();

	const source = resolveGitSource(ref);
	const gitSource =
		source.username && source.password
			? {
					type: "git" as const,
					url: source.url,
					username: source.username,
					password: source.password,
					revision: source.revision,
				}
			: { type: "git" as const, url: source.url, revision: source.revision };

	log(`ingress: creating sandbox ${name}`);
	const sandbox = await Sandbox.create({
		name,
		runtime: VERCEL_RUNTIME,
		source: gitSource,
		ports: [INGRESS_PORT],
		timeout: WORKER_TIMEOUT_MS,
		resources: { vcpus: 1 },
		tags: { kind: "bun-tw-ingress", owner, run: runId },
		env: {
			INGRESS_TOKEN: token,
			INGRESS_PORT: String(INGRESS_PORT),
			TW_ENV,
		},
		persistent: false,
		signal,
	});

	const publicUrl = getPublicUrl(sandbox, INGRESS_PORT);

	// Launch the ingress http server DETACHED — it must keep running for the whole
	// run (mirrors the worker boot's detached runCommand in run.ts).
	const sink = new Writable({
		write(chunk, _encoding, callback) {
			const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			process.stdout.write(chalk.gray(`[ingress] ${text}`));
			callback();
		},
	});
	const ingressCommand = await sandbox.runCommand({
		cmd: "node",
		args: [INGRESS_SCRIPT],
		cwd: SANDBOX_REPO_ROOT,
		detached: true,
		stdout: sink,
		stderr: sink,
		signal,
	});

	// The ingress server is detached and streams logs for the whole run; we never
	// await its completion. When teardown deletes the ingress sandbox the log
	// stream closes and `wait()` rejects with a benign `sandbox_stream_closed`
	// StreamError. Attach a swallowing handler so it can't surface as an uncaught
	// rejection spamming the console at teardown (any other error still throws).
	void ingressCommand
		.wait({ signal })
		.catch((error: unknown) => {
			if (isSandboxStreamClosed(error)) {
				return;
			}
			throw error;
		})
		.catch(() => {
			// A genuine ingress crash is surfaced by the worker-mapping push / the
			// teardown path; nothing to do here beyond not crashing the process.
		});

	// Poll /health until the server is listening (bounded — fail loud if it never
	// comes up so a broken ingress can't silently drop every worker's events).
	const deadline = Date.now() + INGRESS_HEALTH_TIMEOUT_MS;
	for (;;) {
		if (signal.aborted) {
			throw new Error("ingress: aborted while waiting for /health");
		}
		try {
			const response = await fetch(`${publicUrl}/health`, { signal });
			if (response.status === HTTP_OK) {
				log(`ingress: ${name} healthy at ${publicUrl}`);
				return { sandbox, publicUrl, token };
			}
		} catch {
			// not up yet — keep polling until the deadline.
		}
		if (Date.now() >= deadline) {
			throw new Error(
				`ingress ${name} did not become healthy within ${INGRESS_HEALTH_TIMEOUT_MS}ms (${publicUrl}/health)`,
			);
		}
		await sleep(INGRESS_HEALTH_POLL_MS);
	}
};

/**
 * Push one worker's `{ accountId → workerUrl }` mapping to the ingress (token-authed).
 * Called after a worker is booted + its public URL is known, so by the time any
 * test fires Stripe events the ingress can route them to the owning worker. Throws
 * on a non-2xx so a provisioning failure surfaces (the mapping is load-bearing for
 * that worker's delivery isolation).
 */
export const pushWorkerMapping = async ({
	ingressUrl,
	token,
	accountId,
	workerUrl,
}: {
	ingressUrl: string;
	token: string;
	accountId: string;
	workerUrl: string;
}): Promise<void> => {
	const response = await fetch(`${ingressUrl}/ingress/map`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-ingress-token": token,
		},
		body: JSON.stringify({ accountId, workerUrl }),
	});
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`ingress map push for account ${accountId} failed: ${response.status} ${body}`,
		);
	}
};
