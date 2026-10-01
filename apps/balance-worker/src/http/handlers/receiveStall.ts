import type { Context } from "hono";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
} from "../types/balanceWorkerHttp.js";

export const STALL_MAX_MS = 120_000;
const RESPONSE_FLUSH_DELAY_MS = 5;

/** Blocks this thread outright: nothing else on the worker runs, exactly like a frozen task. */
export function blockEventLoop(ms: number): void {
	try {
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
	} catch {
		const until = performance.now() + ms;
		while (performance.now() < until) {
			// busy wait: Atomics.wait is unavailable on this thread
		}
	}
}

export function receiveStall({ ctx }: { ctx: BalanceWorkerHttpContext }) {
	const block = ctx.chaos?.block ?? blockEventLoop;
	return async function handle(context: Context<BalanceWorkerHttpEnv>) {
		let body: unknown;
		try {
			body = await context.req.json();
		} catch {
			return context.json({ error: "Expected a JSON body" }, 400);
		}
		const ms =
			typeof body === "object" && body !== null && "ms" in body
				? body.ms
				: undefined;
		if (
			typeof ms !== "number" ||
			!Number.isSafeInteger(ms) ||
			ms <= 0 ||
			ms > STALL_MAX_MS
		) {
			return context.json(
				{ error: `ms must be an integer between 1 and ${STALL_MAX_MS}` },
				400,
			);
		}
		ctx.logger.warn(
			`Balance worker stalling its event loop for ${ms}ms on request (chaos hook)`,
		);
		setTimeout(() => block(ms), RESPONSE_FLUSH_DELAY_MS);
		return context.json({ stallMs: ms }, 202);
	};
}
