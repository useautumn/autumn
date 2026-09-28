import type {
	HeraldLifecycleContext,
	HeraldLifecycleState,
	StopReason,
} from "./types/heraldLifecycle.js";

/** A start that fails still leaves through stopHerald, so stores close and the exit code says what happened. */
export async function startHerald({
	ctx,
	state,
}: {
	ctx: HeraldLifecycleContext;
	state: HeraldLifecycleState;
}): Promise<void> {
	try {
		await ctx.herald.start();
	} catch (cause) {
		ctx.logger.error(
			{ error: cause, type: "herald_start_failed" },
			"Herald failed to start",
		);
		await stopHerald({ ctx, state, reason: "start_failed" });
	}
}

/** The only way out. Once: a second stop, whatever its reason, waits for the first. */
export function stopHerald({
	ctx,
	state,
	reason,
}: {
	ctx: HeraldLifecycleContext;
	state: HeraldLifecycleState;
	reason: StopReason;
}): Promise<void> {
	state.stopping ??= finishStop({ ctx, reason });
	return state.stopping;
}

/** Exit 0 only for a clean stop on a signal; a crash, a failed start or a failed stop all exit 1. */
async function finishStop({
	ctx,
	reason,
}: {
	ctx: HeraldLifecycleContext;
	reason: StopReason;
}): Promise<void> {
	ctx.logger.info(
		{ type: "herald_stopping", data: { reason } },
		`Herald stopping: ${reason}`,
	);
	const backstop = setTimeout(forceExit, ctx.stopBudgetMs);
	let failed = reason !== "signal";
	try {
		await ctx.herald.stop();
	} catch (cause) {
		failed = true;
		ctx.logger.error(
			{ error: cause, type: "herald_stop_failed" },
			"Herald did not stop cleanly",
		);
	}
	clearTimeout(backstop);
	await exitHerald({ ctx, code: failed ? 1 : 0 });

	function forceExit(): void {
		ctx.logger.error(
			{ type: "herald_stop_forced", data: { stopBudgetMs: ctx.stopBudgetMs } },
			"Herald stop exceeded its budget; exiting anyway",
		);
		void exitHerald({ ctx, code: 1 });
	}
}

/** Logs are flushed before the process ends, so the last line of a failed stop is never lost. */
async function exitHerald({
	ctx,
	code,
}: {
	ctx: Pick<HeraldLifecycleContext, "logger" | "exit">;
	code: number;
}): Promise<void> {
	try {
		await ctx.logger.flush?.();
	} finally {
		ctx.exit(code);
	}
}

/** SIGTERM is the orchestrator asking; SIGINT is a person. Both are a clean stop. */
export function registerProcessSignals({
	ctx,
	state,
	process: target = process,
}: {
	ctx: HeraldLifecycleContext;
	state: HeraldLifecycleState;
	process?: Pick<NodeJS.Process, "once">;
}): void {
	function onSignal(): void {
		void stopHerald({ ctx, state, reason: "signal" });
	}
	target.once("SIGINT", onSignal);
	target.once("SIGTERM", onSignal);
}
