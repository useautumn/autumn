import { landFlush } from "./actions/landFlush.js";
import { takeFlush } from "./actions/takeFlush.js";
import type {
	Committer,
	CommitterConfig,
	CommitterContext,
	CommitterScope,
	FlushCall,
	FlushOutcome,
} from "./types/committer.js";

export const DEFAULT_COMMITTER_CONFIG: CommitterConfig = {
	concurrency: 10,
	maxRowsPerFlush: 500,
	retry: { maxAttempts: 3, initialBackoffMs: 50, maxBackoffMs: 800 },
};

export const createCommitter = ({
	ctx,
	config = DEFAULT_COMMITTER_CONFIG,
}: {
	ctx: CommitterContext;
	config?: CommitterConfig;
}): Committer => {
	const scope: CommitterScope = {
		ctx,
		config,
		state: { queue: [], inFlight: 0 },
	};
	const idle = new Set<() => void>();

	function apply(params: Parameters<Committer["apply"]>[0]) {
		const call: FlushCall = {
			...params,
			rows: countRowChanges({ records: params.records }),
			settle: Promise.withResolvers<FlushOutcome>(),
		};
		scope.state.queue.push(call);
		void startFlushes({ scope, onIdle: notifyIdle });
		return call.settle.promise;
	}

	function drain(): Promise<void> {
		const { state } = scope;
		if (state.queue.length === 0 && state.inFlight === 0)
			return Promise.resolve();
		return new Promise((resolve) => idle.add(resolve));
	}

	function notifyIdle(): void {
		for (const resolve of idle) resolve();
		idle.clear();
	}

	return { apply, drain };
};

/** Starts a flush per free lane; each lane loops until the queue is empty. landFlush never throws for a bad record, only for a bug. */
async function startFlushes({
	scope,
	onIdle,
}: {
	scope: CommitterScope;
	onIdle: () => void;
}): Promise<void> {
	const { state, config } = scope;
	while (state.queue.length > 0 && state.inFlight < lanesOf({ scope })) {
		const flush = takeFlush({ state, maxRows: config.maxRowsPerFlush });
		if (!flush) break;
		state.inFlight += 1;
		try {
			const outcomes = await landFlush({
				ctx: scope.ctx,
				flush,
				retry: config.retry,
			});
			for (const call of flush.calls) {
				const outcome = outcomes.get(call);
				if (outcome) call.settle.resolve(outcome);
				else call.settle.reject(new Error("Flush returned no outcome"));
			}
		} catch (cause) {
			for (const call of flush.calls) call.settle.reject(cause);
		} finally {
			state.inFlight -= 1;
		}
	}
	if (state.queue.length === 0 && state.inFlight === 0) onIdle();
}

/** The live control's concurrency, clamped to the pool-sized ceiling; the boot value when unset. */
function lanesOf({ scope }: { scope: CommitterScope }): number {
	const ceiling = scope.config.concurrency;
	const requested = scope.ctx.control?.read().concurrency ?? ceiling;
	return Math.min(Math.max(1, Math.trunc(requested)), ceiling);
}

function countRowChanges({
	records,
}: {
	records: FlushCall["records"];
}): number {
	let rows = 0;
	for (const record of records) rows += record.mutation.changes.length;
	return rows;
}
