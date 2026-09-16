import type {
	CheckCommand,
	CheckDecision,
	TrackCommand,
	TrackDecision,
} from "@autumn/balance-engine";
import type {
	BalanceHydrationResult,
	BalanceHydrationSelection,
} from "../balanceHydrationContracts.js";
import {
	BalanceHydrationAbortedError,
	BalanceHydrationClosedError,
} from "../balanceHydrationErrors.js";
import {
	assertCommandMatchesSelection,
	buildProbeCommand,
	freezeCheckCommand,
	freezeTrackCommand,
} from "./balanceHydrationCommands.js";
import { abortAllJobs, hydrateSelection } from "./balanceHydrationJobs.js";
import {
	isExactInitializationMiss,
	prewarmResultOf,
} from "./balanceHydrationOutcomes.js";
import {
	assertScopeOpen,
	type BalanceHydrationScope,
} from "./balanceHydrationScope.js";
import { normalizeSelection } from "./balanceHydrationSelection.js";

export async function runCheck({
	scope,
	selection,
	command,
	signal,
}: {
	scope: BalanceHydrationScope;
	selection: BalanceHydrationSelection;
	command: CheckCommand;
	signal?: AbortSignal;
}): Promise<CheckDecision> {
	assertScopeOpen({ scope });
	const normalized = normalizeSelection({ selection });
	const snapshot = freezeCheckCommand({ command });
	assertCommandMatchesSelection({ command: snapshot, selection: normalized });
	try {
		return await scope.client.check({ command: snapshot, signal });
	} catch (cause) {
		if (!isExactInitializationMiss(cause)) throw cause;
	}
	await hydrateSelection({ scope, selection: normalized, signal });
	assertResendAllowed({ scope, signal });
	return scope.client.check({ command: snapshot, signal });
}

export async function runTrack({
	scope,
	selection,
	command,
	signal,
}: {
	scope: BalanceHydrationScope;
	selection: BalanceHydrationSelection;
	command: TrackCommand;
	signal?: AbortSignal;
}): Promise<TrackDecision> {
	assertScopeOpen({ scope });
	const normalized = normalizeSelection({ selection });
	const snapshot = freezeTrackCommand({ command });
	assertCommandMatchesSelection({ command: snapshot, selection: normalized });
	try {
		return await scope.client.track({ command: snapshot, signal });
	} catch (cause) {
		if (!isExactInitializationMiss(cause)) throw cause;
	}
	await hydrateSelection({ scope, selection: normalized, signal });
	assertResendAllowed({ scope, signal });
	return scope.client.track({ command: snapshot, signal });
}

export async function runPrewarm({
	scope,
	selection,
	signal,
}: {
	scope: BalanceHydrationScope;
	selection: BalanceHydrationSelection;
	signal?: AbortSignal;
}): Promise<BalanceHydrationResult> {
	assertScopeOpen({ scope });
	const normalized = normalizeSelection({ selection });
	const probe = buildProbeCommand({ selection: normalized });
	try {
		await scope.client.check({ command: probe, signal });
		return prewarmResultOf({ kind: "already_ready" });
	} catch (cause) {
		if (!isExactInitializationMiss(cause)) throw cause;
	}
	const decision = await hydrateSelection({
		scope,
		selection: normalized,
		signal,
	});
	return prewarmResultOf({ kind: decision.kind });
}

export function closeScope({
	scope,
}: {
	scope: BalanceHydrationScope;
}): Promise<void> {
	if (scope.closePromise) return scope.closePromise;
	scope.closed = true;
	abortAllJobs({ scope, cause: new BalanceHydrationClosedError() });
	scope.closePromise = awaitPhysicalWork({ scope });
	return scope.closePromise;
}

async function awaitPhysicalWork({
	scope,
}: {
	scope: BalanceHydrationScope;
}): Promise<void> {
	await Promise.allSettled([...scope.physicalTasks]);
}

/** Hydration succeeding is not licence to touch the worker for a caller or a
 * coordinator that has since gone away. */
function assertResendAllowed({
	scope,
	signal,
}: {
	scope: BalanceHydrationScope;
	signal?: AbortSignal;
}): void {
	assertScopeOpen({ scope });
	if (signal?.aborted)
		throw new BalanceHydrationAbortedError({ cause: signal.reason });
}
