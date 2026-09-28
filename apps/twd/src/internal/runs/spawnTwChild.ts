import type { TwdLogger } from "../../lib/logger.ts";
import { REPO_ROOT } from "../catalog/repoPaths.ts";

/** Grace between SIGTERM (child tears its sandboxes down) and SIGKILL. */
const KILL_GRACE_MS = 120_000;

/**
 * Run a scripts/tw child (one per swarm/warm: scripts/tw keeps module state).
 * Protocol over Bun IPC: child sends `{type:"ready"}`, parent replies with `init`.
 * `onInitSent` gets a sender for follow-up parent → child messages (only valid after init).
 */
export const spawnTwChild = async <
	TMessage extends { type: string },
	TSend extends { type: string } = never,
>({
	entry,
	init,
	env,
	signal,
	logger,
	onMessage,
	onInitSent,
}: {
	entry: string;
	init: { type: "init"; [key: string]: unknown };
	env?: Record<string, string>;
	signal: AbortSignal;
	logger: TwdLogger;
	onMessage: (message: TMessage) => void;
	onInitSent?: (send: (message: TSend) => void) => void;
}): Promise<{ exitCode: number | null }> => {
	const child = Bun.spawn([process.execPath, entry], {
		cwd: REPO_ROOT,
		// scripts/tw sizes a Stripe budget from its key-pool env at import time; twd passes real
		// per-account keys over IPC, so a placeholder only satisfies that import-time check.
		env: { STRIPE_SANDBOX_SECRET_KEY: "sk_test_twd_placeholder", ...process.env, ...env },
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		serialization: "json",
		ipc: (message: TMessage | { type: "ready" }) => {
			if (message.type === "ready") {
				child.send(init);
				onInitSent?.((next) => child.send(next));
				return;
			}
			onMessage(message as TMessage);
		},
	});

	const drain = async (
		stream: ReadableStream<Uint8Array>,
		level: "info" | "warn",
	) => {
		const decoder = new TextDecoder();
		for await (const chunk of stream) {
			const text = decoder.decode(chunk).trimEnd();
			if (text)
				logger[level]("tw child output", { entry, text: text.slice(0, 4000) });
		}
	};
	void drain(child.stdout, "info").catch(() => undefined);
	void drain(child.stderr, "warn").catch(() => undefined);

	let killTimer: ReturnType<typeof setTimeout> | undefined;
	const onAbort = () => {
		child.kill("SIGTERM");
		killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
	};
	if (signal.aborted) onAbort();
	signal.addEventListener("abort", onAbort, { once: true });
	try {
		return { exitCode: await child.exited };
	} finally {
		signal.removeEventListener("abort", onAbort);
		if (killTimer) clearTimeout(killTimer);
	}
};
