import type { InitializeRequest } from "@autumn/balance-engine";
import {
	BalanceWorkerClientError,
	type InitializeReply,
} from "@autumn/balance-worker-client";
import {
	ReplayHydrationAbortedError,
	ReplayHydrationClosedError,
	ReplayHydrationDeadlineError,
	ReplayHydrationQueueSaturatedError,
	ReplayHydrationSelectionConflictError,
	ReplayHydrationSourceRefusedError,
} from "../replayHydrationErrors.js";
import { buildInitializeRequest } from "./replayCommands.js";
import {
	assertScopeOpen,
	type HydrationJob,
	type ReplayHydrationScope,
} from "./replayHydrationScope.js";
import {
	identityKeyOf,
	type NormalizedSelection,
	selectionKeyOf,
} from "./replaySelection.js";
import { validateSourceState } from "./replaySourceState.js";

type JobWaiter = {
	readonly job: HydrationJob;
	readonly token: symbol;
	readonly signal: AbortSignal | undefined;
	readonly resolve: (decision: InitializeReply) => void;
	readonly reject: (cause: unknown) => void;
	onAbort: (() => void) | undefined;
	finished: boolean;
};

export async function hydrateSelection({
	scope,
	selection,
	signal,
}: {
	scope: ReplayHydrationScope;
	selection: NormalizedSelection;
	signal?: AbortSignal;
}): Promise<InitializeReply> {
	if (signal?.aborted)
		throw new ReplayHydrationAbortedError({ cause: signal.reason });
	assertScopeOpen({ scope });
	const job = jobForSelection({ scope, selection });
	return waitForJob({ scope, job, signal });
}

export function abortAllJobs({
	scope,
	cause,
}: {
	scope: ReplayHydrationScope;
	cause: Error;
}): void {
	for (const job of [...scope.currentJobs.values()])
		abortJob({ scope, job, cause });
}

/**
 * A registered job answers every joiner for its identity, including the already
 * terminal one an abort left behind while its physical load is still running.
 */
function jobForSelection({
	scope,
	selection,
}: {
	scope: ReplayHydrationScope;
	selection: NormalizedSelection;
}): HydrationJob {
	const existing = scope.currentJobs.get(identityKeyOf({ selection }));
	if (!existing) return createJob({ scope, selection });
	if (existing.selectionKey !== selectionKeyOf({ selection }))
		throw new ReplayHydrationSelectionConflictError();
	return existing;
}

function createJob({
	scope,
	selection,
}: {
	scope: ReplayHydrationScope;
	selection: NormalizedSelection;
}): HydrationJob {
	const shouldQueue = scope.activeCount >= scope.limits.maxActive;
	if (shouldQueue && scope.queue.length >= scope.limits.maxQueued)
		throw new ReplayHydrationQueueSaturatedError();
	const settlement = Promise.withResolvers<InitializeReply>();
	settlement.promise.catch(() => undefined);
	const job: HydrationJob = {
		identityKey: identityKeyOf({ selection }),
		selectionKey: selectionKeyOf({ selection }),
		selection,
		deadlineAt: scope.clock.now() + scope.limits.deadlineMs,
		controller: new AbortController(),
		waiters: new Set(),
		settlement,
		timer: undefined,
		phase: "queued",
		physicalPending: false,
		physicalTask: undefined,
	};
	job.timer = scope.clock.setTimeout(
		() => expireJob({ scope, job }),
		scope.limits.deadlineMs,
	);
	scope.currentJobs.set(job.identityKey, job);
	if (shouldQueue) scope.queue.push(job);
	else startJob({ scope, job });
	return job;
}

function expireJob({
	scope,
	job,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
}): void {
	abortJob({ scope, job, cause: new ReplayHydrationDeadlineError() });
}

function abortJob({
	scope,
	job,
	cause,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
	cause: Error;
}): void {
	if (job.phase === "settled") return;
	job.controller.abort(cause);
	settleJob({ scope, job, cause });
}

function settleJob({
	scope,
	job,
	decision,
	cause,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
	decision?: InitializeReply;
	cause?: unknown;
}): void {
	if (job.phase === "settled") return;
	job.phase = "settled";
	scope.clock.clearTimeout(job.timer);
	removeQueuedJob({ scope, job });
	if (!job.physicalPending) unregisterJob({ scope, job });
	if (cause === undefined && decision) job.settlement.resolve(decision);
	else job.settlement.reject(cause);
}

function removeQueuedJob({
	scope,
	job,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
}): void {
	const index = scope.queue.indexOf(job);
	if (index >= 0) scope.queue.splice(index, 1);
}

function unregisterJob({
	scope,
	job,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
}): void {
	if (scope.currentJobs.get(job.identityKey) === job)
		scope.currentJobs.delete(job.identityKey);
}

function assertJobLive({
	scope,
	job,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
}): void {
	if (job.phase === "settled" || job.controller.signal.aborted) {
		throw job.controller.signal.reason ?? new ReplayHydrationAbortedError();
	}
	if (scope.closed) {
		const cause = new ReplayHydrationClosedError();
		abortJob({ scope, job, cause });
		throw cause;
	}
	if (scope.clock.now() >= job.deadlineAt) {
		const cause = new ReplayHydrationDeadlineError();
		abortJob({ scope, job, cause });
		throw cause;
	}
}

function startJob({
	scope,
	job,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
}): void {
	job.phase = "active";
	job.physicalPending = true;
	scope.activeCount++;
	const task = runPhysicalJob({ scope, job });
	job.physicalTask = task;
	scope.physicalTasks.add(task);
}

async function runPhysicalJob({
	scope,
	job,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
}): Promise<void> {
	try {
		const decision = await loadAndInitialize({ scope, job });
		settleJob({ scope, job, decision });
	} catch (cause) {
		settleJob({ scope, job, cause });
	}
	releasePhysicalJob({ scope, job });
}

function releasePhysicalJob({
	scope,
	job,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
}): void {
	job.physicalPending = false;
	if (job.physicalTask) scope.physicalTasks.delete(job.physicalTask);
	job.physicalTask = undefined;
	scope.activeCount--;
	unregisterJob({ scope, job });
	drainQueue({ scope });
}

function drainQueue({ scope }: { scope: ReplayHydrationScope }): void {
	if (scope.closed) return;
	while (scope.activeCount < scope.limits.maxActive) {
		const job = scope.queue.shift();
		if (!job) return;
		if (job.phase !== "queued") continue;
		startJob({ scope, job });
	}
}

async function loadAndInitialize({
	scope,
	job,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
}): Promise<InitializeReply> {
	assertJobLive({ scope, job });
	const sourceResult = await scope.source.load({
		selection: job.selection,
		signal: job.controller.signal,
	});
	assertJobLive({ scope, job });
	if (sourceResult.kind === "refused") {
		throw new ReplayHydrationSourceRefusedError({
			category: sourceResult.category,
			reason: sourceResult.reason,
		});
	}
	const state = validateSourceState({
		input: sourceResult.state,
		catalogRows: sourceResult.catalogRows,
		selection: job.selection,
	});
	return submitInitialization({
		scope,
		job,
		request: buildInitializeRequest({
			selection: job.selection,
			state,
			catalogRows: sourceResult.catalogRows,
		}),
	});
}

async function submitInitialization({
	scope,
	job,
	request,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
	request: InitializeRequest;
}): Promise<InitializeReply> {
	for (let attempt = 0; attempt < 2; attempt++) {
		assertJobLive({ scope, job });
		try {
			const decision = await scope.client.initialize({
				request,
				signal: job.controller.signal,
			});
			assertJobLive({ scope, job });
			return decision;
		} catch (cause) {
			if (!mayResendInitialization({ attempt, cause })) throw cause;
		}
	}
	throw new Error("Unreachable replay initialization attempt");
}

function mayResendInitialization({
	attempt,
	cause,
}: {
	attempt: number;
	cause: unknown;
}): boolean {
	return (
		attempt === 0 &&
		cause instanceof BalanceWorkerClientError &&
		cause.outcome === "unknown"
	);
}

function waitForJob({
	scope,
	job,
	signal,
}: {
	scope: ReplayHydrationScope;
	job: HydrationJob;
	signal?: AbortSignal;
}): Promise<InitializeReply> {
	if (signal?.aborted)
		return Promise.reject(
			new ReplayHydrationAbortedError({ cause: signal.reason }),
		);
	const outcome = Promise.withResolvers<InitializeReply>();
	const waiter: JobWaiter = {
		job,
		token: Symbol("replay-hydration-waiter"),
		signal,
		resolve: outcome.resolve,
		reject: outcome.reject,
		onAbort: undefined,
		finished: false,
	};
	job.waiters.add(waiter.token);
	waiter.onAbort = () => abandonWaiter({ scope, waiter });
	signal?.addEventListener("abort", waiter.onAbort, { once: true });
	void forwardJobSettlement({ waiter });
	return outcome.promise;
}

async function forwardJobSettlement({
	waiter,
}: {
	waiter: JobWaiter;
}): Promise<void> {
	try {
		completeWaiter({ waiter, decision: await waiter.job.settlement.promise });
	} catch (cause) {
		failWaiter({ waiter, cause });
	}
}

function finishWaiter({ waiter }: { waiter: JobWaiter }): boolean {
	if (waiter.finished) return false;
	waiter.finished = true;
	if (waiter.onAbort)
		waiter.signal?.removeEventListener("abort", waiter.onAbort);
	waiter.job.waiters.delete(waiter.token);
	return true;
}

function completeWaiter({
	waiter,
	decision,
}: {
	waiter: JobWaiter;
	decision: InitializeReply;
}): void {
	if (finishWaiter({ waiter })) waiter.resolve(decision);
}

function failWaiter({
	waiter,
	cause,
}: {
	waiter: JobWaiter;
	cause: unknown;
}): void {
	if (finishWaiter({ waiter })) waiter.reject(cause);
}

function abandonWaiter({
	scope,
	waiter,
}: {
	scope: ReplayHydrationScope;
	waiter: JobWaiter;
}): void {
	if (!finishWaiter({ waiter })) return;
	waiter.reject(
		new ReplayHydrationAbortedError({ cause: waiter.signal?.reason }),
	);
	if (waiter.job.waiters.size > 0 || waiter.job.phase === "settled") return;
	abortJob({
		scope,
		job: waiter.job,
		cause: new ReplayHydrationAbortedError({ cause: waiter.signal?.reason }),
	});
}
