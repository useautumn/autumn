import type {
	InitializationDecision,
	InitializeCommand,
} from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import {
	BalanceHydrationAbortedError,
	BalanceHydrationClosedError,
	BalanceHydrationDeadlineError,
	BalanceHydrationQueueSaturatedError,
	BalanceHydrationSelectionConflictError,
	BalanceHydrationSourceRefusedError,
} from "../balanceHydrationErrors.js";
import { buildInitializeCommand } from "./balanceHydrationCommands.js";
import {
	assertScopeOpen,
	type BalanceHydrationScope,
	type HydrationJob,
} from "./balanceHydrationScope.js";
import {
	identityKeyOf,
	type NormalizedSelection,
	selectionKeyOf,
} from "./balanceHydrationSelection.js";
import { validateSourceState } from "./balanceHydrationSourceState.js";

type JobWaiter = {
	readonly job: HydrationJob;
	readonly token: symbol;
	readonly signal: AbortSignal | undefined;
	readonly resolve: (decision: InitializationDecision) => void;
	readonly reject: (cause: unknown) => void;
	onAbort: (() => void) | undefined;
	finished: boolean;
};

export async function hydrateSelection({
	scope,
	selection,
	signal,
}: {
	scope: BalanceHydrationScope;
	selection: NormalizedSelection;
	signal?: AbortSignal;
}): Promise<InitializationDecision> {
	if (signal?.aborted)
		throw new BalanceHydrationAbortedError({ cause: signal.reason });
	assertScopeOpen({ scope });
	const job = jobForSelection({ scope, selection });
	return waitForJob({ scope, job, signal });
}

export function abortAllJobs({
	scope,
	cause,
}: {
	scope: BalanceHydrationScope;
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
	scope: BalanceHydrationScope;
	selection: NormalizedSelection;
}): HydrationJob {
	const existing = scope.currentJobs.get(identityKeyOf({ selection }));
	if (!existing) return createJob({ scope, selection });
	if (existing.selectionKey !== selectionKeyOf({ selection }))
		throw new BalanceHydrationSelectionConflictError();
	return existing;
}

function createJob({
	scope,
	selection,
}: {
	scope: BalanceHydrationScope;
	selection: NormalizedSelection;
}): HydrationJob {
	const shouldQueue = scope.activeCount >= scope.limits.maxActive;
	if (shouldQueue && scope.queue.length >= scope.limits.maxQueued)
		throw new BalanceHydrationQueueSaturatedError();
	const settlement = Promise.withResolvers<InitializationDecision>();
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
	scope: BalanceHydrationScope;
	job: HydrationJob;
}): void {
	abortJob({ scope, job, cause: new BalanceHydrationDeadlineError() });
}

function abortJob({
	scope,
	job,
	cause,
}: {
	scope: BalanceHydrationScope;
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
	scope: BalanceHydrationScope;
	job: HydrationJob;
	decision?: InitializationDecision;
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
	scope: BalanceHydrationScope;
	job: HydrationJob;
}): void {
	const index = scope.queue.indexOf(job);
	if (index >= 0) scope.queue.splice(index, 1);
}

function unregisterJob({
	scope,
	job,
}: {
	scope: BalanceHydrationScope;
	job: HydrationJob;
}): void {
	if (scope.currentJobs.get(job.identityKey) === job)
		scope.currentJobs.delete(job.identityKey);
}

function assertJobLive({
	scope,
	job,
}: {
	scope: BalanceHydrationScope;
	job: HydrationJob;
}): void {
	if (job.phase === "settled" || job.controller.signal.aborted) {
		throw job.controller.signal.reason ?? new BalanceHydrationAbortedError();
	}
	if (scope.closed) {
		const cause = new BalanceHydrationClosedError();
		abortJob({ scope, job, cause });
		throw cause;
	}
	if (scope.clock.now() >= job.deadlineAt) {
		const cause = new BalanceHydrationDeadlineError();
		abortJob({ scope, job, cause });
		throw cause;
	}
}

function startJob({
	scope,
	job,
}: {
	scope: BalanceHydrationScope;
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
	scope: BalanceHydrationScope;
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
	scope: BalanceHydrationScope;
	job: HydrationJob;
}): void {
	job.physicalPending = false;
	if (job.physicalTask) scope.physicalTasks.delete(job.physicalTask);
	job.physicalTask = undefined;
	scope.activeCount--;
	unregisterJob({ scope, job });
	drainQueue({ scope });
}

function drainQueue({ scope }: { scope: BalanceHydrationScope }): void {
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
	scope: BalanceHydrationScope;
	job: HydrationJob;
}): Promise<InitializationDecision> {
	assertJobLive({ scope, job });
	const sourceResult = await scope.source.load({
		selection: job.selection,
		signal: job.controller.signal,
	});
	assertJobLive({ scope, job });
	if (sourceResult.kind === "refused") {
		throw new BalanceHydrationSourceRefusedError({
			category: sourceResult.category,
			reason: sourceResult.reason,
		});
	}
	const state = validateSourceState({
		input: sourceResult.state,
		selection: job.selection,
	});
	return submitInitialization({
		scope,
		job,
		command: buildInitializeCommand({ selection: job.selection, state }),
	});
}

async function submitInitialization({
	scope,
	job,
	command,
}: {
	scope: BalanceHydrationScope;
	job: HydrationJob;
	command: InitializeCommand;
}): Promise<InitializationDecision> {
	for (let attempt = 0; attempt < 2; attempt++) {
		assertJobLive({ scope, job });
		try {
			const decision = await scope.client.initialize({
				command,
				signal: job.controller.signal,
			});
			return acceptInitializationResponse({ scope, job, decision });
		} catch (cause) {
			if (!mayResendInitialization({ attempt, cause })) throw cause;
		}
	}
	throw new Error("Unreachable replay initialization attempt");
}

/**
 * A known acknowledgement is never discarded on clock reading alone: only a
 * fired deadline timer, an abort, or a closed scope may refuse it. The timer
 * still bounds the caller, because it settles the job before this runs.
 */
function acceptInitializationResponse({
	scope,
	job,
	decision,
}: {
	scope: BalanceHydrationScope;
	job: HydrationJob;
	decision: InitializationDecision;
}): InitializationDecision {
	if (job.phase === "settled" || job.controller.signal.aborted) {
		throw job.controller.signal.reason ?? new BalanceHydrationAbortedError();
	}
	if (scope.closed) {
		const cause = new BalanceHydrationClosedError();
		abortJob({ scope, job, cause });
		throw cause;
	}
	return decision;
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
	scope: BalanceHydrationScope;
	job: HydrationJob;
	signal?: AbortSignal;
}): Promise<InitializationDecision> {
	if (signal?.aborted)
		return Promise.reject(
			new BalanceHydrationAbortedError({ cause: signal.reason }),
		);
	const outcome = Promise.withResolvers<InitializationDecision>();
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
	decision: InitializationDecision;
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
	scope: BalanceHydrationScope;
	waiter: JobWaiter;
}): void {
	if (!finishWaiter({ waiter })) return;
	waiter.reject(
		new BalanceHydrationAbortedError({ cause: waiter.signal?.reason }),
	);
	if (waiter.job.waiters.size > 0 || waiter.job.phase === "settled") return;
	abortJob({
		scope,
		job: waiter.job,
		cause: new BalanceHydrationAbortedError({ cause: waiter.signal?.reason }),
	});
}
