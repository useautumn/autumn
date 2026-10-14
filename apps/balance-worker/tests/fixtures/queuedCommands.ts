import {
	type AtomFinalizeCommand,
	type FinalizeCommand,
	parseAtomFinalizeCommand,
	parseFinalizeCommand,
	parseResetCommand,
	parseUpdateBalanceCommand,
	type ResetCommand,
	type TrackCommand,
	type UpdateBalanceCommand,
	type WorkerLock,
} from "@autumn/balance-engine";
import { type CommandPipeline, identityOf } from "./commandPipeline.js";
import { createTrackCommand, testOccurredAt, testOrg } from "./mutations.js";

export const trackOf = ({
	customerId,
	commandId,
	value = 1,
}: {
	customerId: string;
	commandId: string;
	value?: number;
}): TrackCommand =>
	createTrackCommand({
		identity: identityOf({ customerId }),
		commandId,
		value,
	});

export const resetOf = ({
	customerId,
	commandId,
}: {
	customerId: string;
	commandId: string;
}): ResetCommand =>
	parseResetCommand({
		input: {
			schemaVersion: 1,
			type: "reset",
			commandId,
			requestId: `req_${commandId}`,
			identity: identityOf({ customerId }),
			occurredAt: testOccurredAt,
			org: testOrg,
		},
	});

export const updateBalanceOf = ({
	customerId,
	commandId,
	addToBalance = -1,
}: {
	customerId: string;
	commandId: string;
	addToBalance?: number;
}): UpdateBalanceCommand =>
	parseUpdateBalanceCommand({
		input: {
			schemaVersion: 1,
			type: "updateBalance",
			commandId,
			requestId: `req_${commandId}`,
			identity: identityOf({ customerId }),
			occurredAt: testOccurredAt,
			org: testOrg,
			featureId: "messages",
			internalFeatureId: "feat_messages",
			addToBalance,
		},
	});

/** A track that opens lock `lockId` over `value`, as a check with a lock asks for. */
export const lockingTrackOf = ({
	customerId,
	lockId,
	value = 10,
}: {
	customerId: string;
	lockId: string;
	value?: number;
}): TrackCommand => ({
	...trackOf({ customerId, commandId: `lock_${lockId}`, value }),
	lock: {
		id: `lck_${lockId}`,
		lockId,
		expiresAt: testOccurredAt + 86_400_000,
		expiryAction: "confirm",
	},
});

/** The sync check-with-lock path: a track that opens a lock, answered once the store holds the lock row. */
export const takeLock = async ({
	pipeline,
	customerId,
	lockId,
	value = 10,
}: {
	pipeline: CommandPipeline;
	customerId: string;
	lockId: string;
	value?: number;
}): Promise<WorkerLock> => {
	const reply = await pipeline.processor.track({
		command: lockingTrackOf({ customerId, lockId, value }),
	});
	const opened = reply.changes.find(
		(change) => change.table === "locks" && change.op === "insert",
	);
	if (opened?.table !== "locks" || opened.op !== "insert")
		throw new Error("Expected the track to open a lock");
	return opened.row;
};

/** What the server queues when the lock's owner is unreachable: the lock row it read, and the value to settle at. */
export const finalizeOf = ({
	lock,
	finalValue,
	commandId = `finalize_${lock.lock_id}`,
}: {
	lock: WorkerLock;
	finalValue: number | null;
	commandId?: string;
}): FinalizeCommand =>
	parseFinalizeCommand({
		input: {
			schemaVersion: 1,
			type: "finalize",
			commandId,
			requestId: `req_${commandId}`,
			identity: identityOf({ customerId: lock.customer_id }),
			occurredAt: testOccurredAt,
			org: testOrg,
			lock,
			internalFeatureId: "feat_messages",
			finalValue,
			properties: null,
		},
	});

/** The Atom's finalize of `lockId` as journal entry `seq`, naming the lock as the API does. */
export const atomFinalizeOf = ({
	customerId,
	lockId,
	seq,
	finalValue = 0,
	featureId = "messages",
	commandId = `atom_finalize_${seq}`,
}: {
	customerId: string;
	lockId: string;
	seq: number;
	finalValue?: number | null;
	featureId?: string;
	commandId?: string;
}): AtomFinalizeCommand =>
	parseAtomFinalizeCommand({
		input: {
			schemaVersion: 1,
			type: "atomFinalize",
			commandId,
			requestId: `req_${commandId}`,
			identity: identityOf({ customerId }),
			occurredAt: testOccurredAt,
			org: testOrg,
			lockId,
			featureId,
			internalFeatureId: "feat_messages",
			finalValue,
			properties: null,
			source: { atomId: "atom_1", writerId: "w_1", seq },
		},
	});
