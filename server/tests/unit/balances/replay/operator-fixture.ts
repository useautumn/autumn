import type {
	CheckCommand,
	MeteringIdentity,
	TrackCommand,
	UnsupportedCommandReason,
} from "@autumn/balance-engine";
import {
	BalanceWorkerClientError,
	type CheckReply,
	type TrackReply,
} from "@autumn/balance-worker-client";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { parseReplayManifest } from "@/internal/balances/replay/manifest/parseReplayManifest.js";
import type {
	ReplayEnvironment,
	ReplayManifest,
	ReplayManifestBaseline,
	ReplayManifestRequest,
	ReplayOperation,
	ReplayRequestBody,
} from "@/internal/balances/replay/manifest/replayManifestContracts.js";
import type {
	ReplayHydrationCoordinator,
	ReplayHydrationResult,
	ReplayHydrationSelection,
} from "@/internal/balances/replay/replayHydrationContracts.js";

const DAY_MS = 86_400_000;

export const REPLAY_BASELINE: ReplayManifestBaseline = {
	id: "snapshot-replay",
	capturedAtMs: 1_790_000_000_000,
};

/** The archive clock trails the baseline clock by a day so rebasing is observable. */
export const ARCHIVE_WINDOW = {
	startMs: REPLAY_BASELINE.capturedAtMs - DAY_MS,
	endMs: REPLAY_BASELINE.capturedAtMs - DAY_MS + 60_000,
} as const;

/** Must mirror the refusal reason runBalanceWorkerTrack uses for event_name. */
export const EVENT_NAME_REFUSAL_REASON = "event_name_not_supported";

export type ReplayArchiveRecord = {
	id: string;
	archivedAtMs: number;
	orgId: string;
	env: ReplayEnvironment;
	customerId: string;
	operation: ReplayOperation;
	body: ReplayRequestBody;
};

let archiveSequence = 0;

export function createArchiveRecord({
	id,
	orgId = "org_replay",
	env = "sandbox",
	customerId = "cus_replay",
	operation = "check",
	offsetMs = 1_000,
	body,
}: {
	id?: string;
	orgId?: string;
	env?: ReplayEnvironment;
	customerId?: string;
	operation?: ReplayOperation;
	offsetMs?: number;
	body: ReplayRequestBody;
}): ReplayArchiveRecord {
	archiveSequence += 1;
	return {
		id: id ?? `obs_${archiveSequence}`,
		archivedAtMs: ARCHIVE_WINDOW.startMs + offsetMs,
		orgId,
		env,
		customerId,
		operation,
		body,
	};
}

export function buildReplayManifest({
	records,
	baseline = REPLAY_BASELINE,
}: {
	records: readonly ReplayArchiveRecord[];
	baseline?: ReplayManifestBaseline;
}): ReplayManifest {
	return parseReplayManifest({
		input: {
			baseline: { ...baseline },
			window: { ...ARCHIVE_WINDOW },
			requests: records.map((record) => ({ ...record })),
		},
	});
}

export function buildReplayRequest({
	record,
	baseline,
}: {
	record: ReplayArchiveRecord;
	baseline?: ReplayManifestBaseline;
}): ReplayManifestRequest {
	const [request] = buildReplayManifest({
		records: [record],
		baseline,
	}).requests;
	if (!request) throw new Error("replay manifest produced no request");
	return request;
}

export function replayEnvOf({
	identity,
}: {
	identity: MeteringIdentity;
}): ReplayEnvironment {
	return identity.env === "live" ? "live" : "sandbox";
}

/** What the client raises when the worker refuses a command the engine cannot decide. */
export function unsupportedCommandError({
	reason,
}: {
	reason: UnsupportedCommandReason;
}): BalanceWorkerClientError {
	return new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: `The worker cannot decide this command: ${reason}`,
		workerCode: "UNSUPPORTED_COMMAND",
		workerReason: reason,
	});
}

/** The public converters own the reply shape; replay pins the values it reports. */
export function findReplyValue({
	reply,
	key,
}: {
	reply: unknown;
	key: string;
}): unknown {
	if (Array.isArray(reply)) {
		for (const entry of reply) {
			const found = findReplyValue({ reply: entry, key });
			if (found !== undefined) return found;
		}
		return undefined;
	}
	if (reply === null || typeof reply !== "object") return undefined;
	const entries = Object.entries(reply);
	for (const [entryKey, value] of entries) if (entryKey === key) return value;
	for (const [, value] of entries) {
		const found = findReplyValue({ reply: value, key });
		if (found !== undefined) return found;
	}
	return undefined;
}

export function createDeferred<T>() {
	let resolve: (value: T) => void = () => undefined;
	let reject: (reason: unknown) => void = () => undefined;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

/** Sleeping advances the fake clock, so pacing shows up in measured wall time. */
export function createManualClock({ start = 0 }: { start?: number } = {}) {
	const sleeps: number[] = [];
	const state = { nowMs: start };
	const advance = ({ durationMs }: { durationMs: number }) => {
		state.nowMs += durationMs;
	};
	return {
		sleeps,
		advance,
		sleptMs: () => sleeps.reduce((total, durationMs) => total + durationMs, 0),
		clock: {
			now: () => state.nowMs,
			sleep: ({ durationMs }: { durationMs: number; signal?: AbortSignal }) => {
				sleeps.push(durationMs);
				advance({ durationMs });
				return Promise.resolve();
			},
		},
	};
}

export function createReadContextSpy({ ctx }: { ctx: AutumnContext }) {
	const identities: MeteringIdentity[] = [];
	const readContext = ({ identity }: { identity: MeteringIdentity }) => {
		identities.push(identity);
		return ctx;
	};
	return { readContext, identities };
}

export type FakeCoordinatorCall = {
	operation: "prewarm" | "check" | "track";
	customerId: string;
};

/** Raw coordinator fake for scheduling proofs; real composition lives in
 *  operator-composition.test.ts. */
export function createFakeCoordinator({
	onPrewarm,
	onCheck,
	onTrack,
}: {
	onPrewarm?: (params: {
		selection: ReplayHydrationSelection;
	}) => Promise<ReplayHydrationResult>;
	onCheck?: (params: {
		selection: ReplayHydrationSelection;
		command: CheckCommand;
	}) => Promise<CheckReply>;
	onTrack?: (params: {
		selection: ReplayHydrationSelection;
		command: TrackCommand;
	}) => Promise<TrackReply>;
} = {}) {
	const calls: FakeCoordinatorCall[] = [];
	const checkCommands: CheckCommand[] = [];
	const trackCommands: TrackCommand[] = [];
	const selections: ReplayHydrationSelection[] = [];
	const activeByCustomer = new Map<string, number>();
	const state = {
		closed: false,
		activePrewarm: 0,
		maxActivePrewarm: 0,
		maxActiveCustomers: 0,
		maxActivePerCustomer: 0,
	};

	const enter = ({ customerId }: { customerId: string }) => {
		const next = (activeByCustomer.get(customerId) ?? 0) + 1;
		activeByCustomer.set(customerId, next);
		state.maxActivePerCustomer = Math.max(state.maxActivePerCustomer, next);
		state.maxActiveCustomers = Math.max(
			state.maxActiveCustomers,
			activeByCustomer.size,
		);
	};

	const leave = ({ customerId }: { customerId: string }) => {
		const next = (activeByCustomer.get(customerId) ?? 1) - 1;
		if (next <= 0) activeByCustomer.delete(customerId);
		else activeByCustomer.set(customerId, next);
	};

	const coordinator: ReplayHydrationCoordinator = {
		async prewarm({ selection }) {
			const customerId = selection.identity.customerId;
			calls.push({ operation: "prewarm", customerId });
			selections.push(selection);
			state.activePrewarm += 1;
			state.maxActivePrewarm = Math.max(
				state.maxActivePrewarm,
				state.activePrewarm,
			);
			try {
				if (!onPrewarm) return { kind: "initialized", freshParity: true };
				return await onPrewarm({ selection });
			} finally {
				state.activePrewarm -= 1;
			}
		},
		async check({ selection, command }) {
			const customerId = selection.identity.customerId;
			calls.push({ operation: "check", customerId });
			checkCommands.push(command);
			enter({ customerId });
			try {
				if (!onCheck) throw new Error("unexpected coordinator check");
				return await onCheck({ selection, command });
			} finally {
				leave({ customerId });
			}
		},
		async track({ selection, command }) {
			const customerId = selection.identity.customerId;
			calls.push({ operation: "track", customerId });
			trackCommands.push(command);
			enter({ customerId });
			try {
				if (!onTrack) throw new Error("unexpected coordinator track");
				return await onTrack({ selection, command });
			} finally {
				leave({ customerId });
			}
		},
		close() {
			state.closed = true;
			return Promise.resolve();
		},
	};

	return {
		coordinator,
		calls,
		checkCommands,
		trackCommands,
		selections,
		state,
	};
}
