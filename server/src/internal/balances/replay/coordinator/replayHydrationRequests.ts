import type { CheckCommand, TrackCommand } from "@autumn/balance-engine";
import type { CheckReply, TrackReply } from "@autumn/balance-worker-client";
import type {
	ReplayHydrationResult,
	ReplayHydrationSelection,
} from "../replayHydrationContracts.js";
import {
	ReplayHydrationAbortedError,
	ReplayHydrationClosedError,
} from "../replayHydrationErrors.js";
import {
	assertCommandMatchesSelection,
	buildProbeCommand,
	freezeCheckCommand,
	freezeTrackCommand,
} from "./replayCommands.js";
import { abortAllJobs, hydrateSelection } from "./replayHydrationJobs.js";
import {
	initializeResponseToOutcome,
	isExactInitializationMiss,
	prewarmResultOf,
} from "./replayHydrationOutcomes.js";
import {
	assertScopeOpen,
	type ReplayHydrationScope,
} from "./replayHydrationScope.js";
import { normalizeSelection } from "./replaySelection.js";

export async function runCheck({
	scope,
	selection,
	command,
	signal,
}: {
	scope: ReplayHydrationScope;
	selection: ReplayHydrationSelection;
	command: CheckCommand;
	signal?: AbortSignal;
}): Promise<CheckReply> {
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
	scope: ReplayHydrationScope;
	selection: ReplayHydrationSelection;
	command: TrackCommand;
	signal?: AbortSignal;
}): Promise<TrackReply> {
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
	scope: ReplayHydrationScope;
	selection: ReplayHydrationSelection;
	signal?: AbortSignal;
}): Promise<ReplayHydrationResult> {
	assertScopeOpen({ scope });
	const normalized = normalizeSelection({ selection });
	const probe = buildProbeCommand({ selection: normalized });
	try {
		await scope.client.check({ command: probe, signal });
		return prewarmResultOf({ kind: "already_ready" });
	} catch (cause) {
		if (!isExactInitializationMiss(cause)) throw cause;
	}
	const response = await hydrateSelection({
		scope,
		selection: normalized,
		signal,
	});
	return prewarmResultOf({ kind: initializeResponseToOutcome({ response }) });
}

export function closeScope({
	scope,
}: {
	scope: ReplayHydrationScope;
}): Promise<void> {
	if (scope.closePromise) return scope.closePromise;
	scope.closed = true;
	abortAllJobs({ scope, cause: new ReplayHydrationClosedError() });
	scope.closePromise = awaitPhysicalWork({ scope });
	return scope.closePromise;
}

async function awaitPhysicalWork({
	scope,
}: {
	scope: ReplayHydrationScope;
}): Promise<void> {
	await Promise.allSettled([...scope.physicalTasks]);
}

/** Hydration succeeding is not licence to touch the worker for a caller or a
 * coordinator that has since gone away. */
function assertResendAllowed({
	scope,
	signal,
}: {
	scope: ReplayHydrationScope;
	signal?: AbortSignal;
}): void {
	assertScopeOpen({ scope });
	if (signal?.aborted)
		throw new ReplayHydrationAbortedError({ cause: signal.reason });
}
