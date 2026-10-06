import {
	type MutatingCommand,
	meteringIdentityToSubjectKey,
} from "@autumn/balance-engine";
import type { AutumnLogger } from "@autumn/logging";

const SLOW_DECIDE_MS = 20;
const MAX_LOGS_PER_WINDOW = 10;
const LOG_WINDOW_MS = 10_000;

export type SlowDecideReporter = {
	measure<Value>(params: { command: MutatingCommand; run: () => Value }): Value;
};

export function createSlowDecideReporter({
	ctx,
	config,
}: {
	ctx: {
		logger?: Partial<Pick<AutumnLogger, "warn">>;
		now: () => number;
		stateBytesOf(params: { subjectKey: string }): number | null;
		pendingCommands(): number;
	};
	config: { topic: string; partition: number };
}): SlowDecideReporter {
	const window = { startedAt: Number.NEGATIVE_INFINITY, logged: 0 };

	function hasLogRoom({ at }: { at: number }): boolean {
		if (at - window.startedAt >= LOG_WINDOW_MS) {
			window.startedAt = at;
			window.logged = 0;
		}
		return window.logged < MAX_LOGS_PER_WINDOW;
	}

	function report({
		command,
		durationMs,
		at,
	}: {
		command: MutatingCommand;
		durationMs: number;
		at: number;
	}): void {
		if (durationMs < SLOW_DECIDE_MS || !hasLogRoom({ at })) return;
		window.logged += 1;
		const { identity } = command;
		ctx.logger?.warn?.(
			{
				event: "balance_worker.slow_decide",
				data: {
					topic: config.topic,
					partition: config.partition,
					commandType: command.type,
					customerId: identity.customerId,
					entityId: identity.entityId ?? null,
					durationMs: roundMs(durationMs),
					stateBytes: ctx.stateBytesOf({
						subjectKey: meteringIdentityToSubjectKey({ identity }),
					}),
					pendingCommands: ctx.pendingCommands(),
				},
			},
			`Balance worker decide held the thread ${roundMs(durationMs)}ms (${command.type})`,
		);
	}

	function measure<Value>({
		command,
		run,
	}: {
		command: MutatingCommand;
		run: () => Value;
	}): Value {
		if (!ctx.logger?.warn) return run();
		const startedAt = ctx.now();
		try {
			return run();
		} finally {
			try {
				const at = ctx.now();
				report({ command, durationMs: at - startedAt, at });
			} catch {}
		}
	}

	return { measure };
}

function roundMs(ms: number): number {
	return Math.round(ms * 100) / 100;
}
