import type {
	HeraldLifecycleContext,
	HeraldLifecycleState,
	StopReason,
} from "./types/heraldLifecycle.js";

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
