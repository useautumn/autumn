import { isDeepStrictEqual } from "node:util";
import {
	type CustomerMeteringState,
	computeTrack,
	executeTrack,
	meteringPartitionKeyOf,
	parseTrackCommand,
	type TrackCommand,
	type TrackDecision,
	type TrackOutcome,
	trackCommandFingerprintOf,
} from "@autumn/balance-engine";
import type {
	DurableTrackOutcomeApplyResult,
	DurableTrackOutcomeRecord,
	SqliteBalanceStateStore,
} from "../state/sqliteBalanceStateStore.js";
import {
	type CommittedTrackOutcomeAppender,
	TrackOutcomeBatchNotCommittedError,
} from "./committedTrackOutcomeAppender.js";

export class PartitionTrackWriterCapacityError extends Error {
	constructor() {
		super("Partition track writer pending capacity reached");
		this.name = "PartitionTrackWriterCapacityError";
	}
}

export class PartitionTrackStateNotFoundError extends Error {
	constructor({ customerKey }: { customerKey: string }) {
		super(`Partition track state not found: ${customerKey}`);
		this.name = "PartitionTrackStateNotFoundError";
	}
}

export class TrackOutcomeBatchAppendError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Track outcome batch was not durably appended", { cause });
		this.name = "TrackOutcomeBatchAppendError";
	}
}

export class PartitionTrackWriterRecoveryRequiredError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Partition track writer requires recovery", { cause });
		this.name = "PartitionTrackWriterRecoveryRequiredError";
	}
}

type PartitionTrackStateStore = Pick<
	SqliteBalanceStateStore,
	"readState" | "readTrackReceipt" | "applyDurableTrackOutcomes"
>;

export type PartitionTrackWriterLimits = {
	maxBatchSize: number;
	maxPendingCommands: number;
	maxPendingCommandsPerCustomer: number;
};

export type PartitionTrackWriterReceiptPolicy = {
	retentionMs: number;
	now: () => number;
};

type PendingTrackWaiter = {
	kind: "new" | "duplicate";
	resolve: (decision: TrackDecision) => void;
	reject: (error: unknown) => void;
};

type PendingTrackCommand = {
	pendingKey: string;
	customerKey: string;
	outcome: TrackOutcome;
	waiters: PendingTrackWaiter[];
};

const assertPositiveSafeInteger = ({
	name,
	value,
}: {
	name: string;
	value: number;
}): void => {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new RangeError(`${name} must be a positive safe integer`);
	}
};

const validateWriterConfiguration = ({
	topic,
	partition,
	limits,
	receiptPolicy,
}: {
	topic: string;
	partition: number;
	limits: PartitionTrackWriterLimits;
	receiptPolicy: PartitionTrackWriterReceiptPolicy;
}): void => {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
	assertPositiveSafeInteger({
		name: "maxBatchSize",
		value: limits.maxBatchSize,
	});
	assertPositiveSafeInteger({
		name: "maxPendingCommands",
		value: limits.maxPendingCommands,
	});
	assertPositiveSafeInteger({
		name: "maxPendingCommandsPerCustomer",
		value: limits.maxPendingCommandsPerCustomer,
	});
	assertPositiveSafeInteger({
		name: "receiptPolicy.retentionMs",
		value: receiptPolicy.retentionMs,
	});
};

const deduplicationExpiryOf = ({
	receiptPolicy,
}: {
	receiptPolicy: PartitionTrackWriterReceiptPolicy;
}): number => {
	const acceptedAt = receiptPolicy.now();
	if (!Number.isSafeInteger(acceptedAt) || acceptedAt < 0) {
		throw new RangeError(
			"receiptPolicy.now() must return a non-negative safe integer",
		);
	}
	const expiresAt = acceptedAt + receiptPolicy.retentionMs;
	if (!Number.isSafeInteger(expiresAt)) {
		throw new RangeError("Track receipt expiry must be a safe integer");
	}
	return expiresAt;
};

const pendingKeyOf = ({ command }: { command: TrackCommand }): string =>
	JSON.stringify([
		meteringPartitionKeyOf({ identity: command.identity }),
		command.commandId,
	]);

const createWaiter = ({
	kind,
}: {
	kind: PendingTrackWaiter["kind"];
}): { promise: Promise<TrackDecision>; waiter: PendingTrackWaiter } => {
	let resolveWaiter: PendingTrackWaiter["resolve"] | null = null;
	let rejectWaiter: PendingTrackWaiter["reject"] | null = null;
	const promise = new Promise<TrackDecision>((resolve, reject) => {
		resolveWaiter = resolve;
		rejectWaiter = reject;
	});
	if (!resolveWaiter || !rejectWaiter) {
		throw new Error("Expected pending track waiter callbacks");
	}
	return {
		promise,
		waiter: { kind, resolve: resolveWaiter, reject: rejectWaiter },
	};
};

const receiptFromApplyResult = ({
	result,
	pending,
	stateStore,
}: {
	result: DurableTrackOutcomeApplyResult;
	pending: PendingTrackCommand;
	stateStore: PartitionTrackStateStore;
}): TrackOutcome => {
	if (result.kind !== "position_already_applied") return result.receipt;

	const receipt = stateStore.readTrackReceipt({
		identity: pending.outcome.identity,
		commandId: pending.outcome.commandId,
	});
	if (!receipt || !isDeepStrictEqual(receipt, pending.outcome)) {
		throw new Error(
			`Applied Kafka position has no matching receipt: ${pending.outcome.commandId}`,
		);
	}
	return receipt;
};

export const createPartitionTrackWriter = ({
	topic,
	partition,
	stateStore,
	appender,
	limits,
	receiptPolicy,
}: {
	topic: string;
	partition: number;
	stateStore: PartitionTrackStateStore;
	appender: CommittedTrackOutcomeAppender;
	limits: PartitionTrackWriterLimits;
	receiptPolicy: PartitionTrackWriterReceiptPolicy;
}): {
	submitTrack({ command }: { command: TrackCommand }): Promise<TrackDecision>;
} => {
	validateWriterConfiguration({ topic, partition, limits, receiptPolicy });

	const projectedStatesByCustomerKey = new Map<string, CustomerMeteringState>();
	const pendingCommandsByKey = new Map<string, PendingTrackCommand>();
	const pendingCommandCountsByCustomerKey = new Map<string, number>();
	const waitingCommands: PendingTrackCommand[] = [];
	let drainScheduled = false;
	let draining = false;
	let recoveryError: PartitionTrackWriterRecoveryRequiredError | null = null;

	const clearPendingState = (): void => {
		waitingCommands.length = 0;
		pendingCommandsByKey.clear();
		pendingCommandCountsByCustomerKey.clear();
		projectedStatesByCustomerKey.clear();
	};

	const rejectAllPending = ({ error }: { error: Error }): void => {
		for (const pending of pendingCommandsByKey.values()) {
			for (const waiter of pending.waiters) waiter.reject(error);
		}
		clearPendingState();
	};

	const enterRecovery = ({
		cause,
	}: {
		cause: unknown;
	}): PartitionTrackWriterRecoveryRequiredError => {
		const error = new PartitionTrackWriterRecoveryRequiredError({ cause });
		recoveryError = error;
		rejectAllPending({ error });
		return error;
	};

	const removePendingCommand = ({
		pending,
	}: {
		pending: PendingTrackCommand;
	}): void => {
		pendingCommandsByKey.delete(pending.pendingKey);
		const pendingCount =
			(pendingCommandCountsByCustomerKey.get(pending.customerKey) ?? 0) - 1;
		if (pendingCount > 0) {
			pendingCommandCountsByCustomerKey.set(pending.customerKey, pendingCount);
			return;
		}
		pendingCommandCountsByCustomerKey.delete(pending.customerKey);
		projectedStatesByCustomerKey.delete(pending.customerKey);
	};

	const settleBatch = ({
		batch,
		results,
	}: {
		batch: PendingTrackCommand[];
		results: DurableTrackOutcomeApplyResult[];
	}): void => {
		if (results.length !== batch.length) {
			throw new Error(
				"Durable apply result count did not match appended batch",
			);
		}
		const receipts = results.map((result, index) => {
			const pending = batch[index];
			if (!pending) throw new Error("Expected pending track command");
			return receiptFromApplyResult({ result, pending, stateStore });
		});

		for (const [index, pending] of batch.entries()) {
			const receipt = receipts[index];
			if (!receipt) throw new Error("Expected applied track receipt");
			removePendingCommand({ pending });
			for (const waiter of pending.waiters) {
				waiter.resolve({ kind: waiter.kind, outcome: receipt });
			}
		}
	};

	const processBatch = async ({
		batch,
	}: {
		batch: PendingTrackCommand[];
	}): Promise<boolean> => {
		let baseOffset: bigint;
		try {
			const appendResult = await appender.appendCommitted({
				topic,
				partition,
				outcomes: batch.map(({ outcome }) => outcome),
			});
			baseOffset = appendResult.baseOffset;
		} catch (cause) {
			if (cause instanceof TrackOutcomeBatchNotCommittedError) {
				rejectAllPending({
					error: new TrackOutcomeBatchAppendError({ cause }),
				});
				return false;
			}
			enterRecovery({ cause });
			return false;
		}
		if (typeof baseOffset !== "bigint" || baseOffset < 0n) {
			enterRecovery({ cause: new RangeError("Invalid appended Kafka offset") });
			return false;
		}

		const records: DurableTrackOutcomeRecord[] = batch.map(
			({ outcome }, index) => ({
				position: {
					topic,
					partition,
					offset: baseOffset + BigInt(index),
				},
				outcome,
			}),
		);
		try {
			const results = stateStore.applyDurableTrackOutcomes({ records });
			settleBatch({ batch, results });
			return true;
		} catch (cause) {
			enterRecovery({ cause });
			return false;
		}
	};

	const drain = async (): Promise<void> => {
		if (draining || recoveryError) return;
		draining = true;
		try {
			while (waitingCommands.length > 0 && !recoveryError) {
				const batch = waitingCommands.splice(0, limits.maxBatchSize);
				const shouldContinue = await processBatch({ batch });
				if (!shouldContinue) return;
			}
		} finally {
			draining = false;
		}
	};

	const scheduleDrain = (): void => {
		if (drainScheduled || draining || recoveryError) return;
		drainScheduled = true;
		setImmediate(() => {
			drainScheduled = false;
			void drain();
		});
	};

	const submitTrack = async ({
		command,
	}: {
		command: TrackCommand;
	}): Promise<TrackDecision> => {
		if (recoveryError) throw recoveryError;
		const parsedCommand = parseTrackCommand({ input: command });
		const customerKey = meteringPartitionKeyOf({
			identity: parsedCommand.identity,
		});
		const pendingKey = pendingKeyOf({ command: parsedCommand });
		const pendingCommand = pendingCommandsByKey.get(pendingKey);
		if (pendingCommand) {
			if (
				pendingCommand.outcome.commandFingerprint !==
				trackCommandFingerprintOf({ command: parsedCommand })
			) {
				return Promise.resolve({
					kind: "unsupported",
					reason: "command_conflict",
				});
			}
			const { promise, waiter } = createWaiter({ kind: "duplicate" });
			pendingCommand.waiters.push(waiter);
			return promise;
		}

		const state =
			projectedStatesByCustomerKey.get(customerKey) ??
			stateStore.readState({ identity: parsedCommand.identity });
		if (!state) throw new PartitionTrackStateNotFoundError({ customerKey });
		const existingReceipt = stateStore.readTrackReceipt({
			identity: parsedCommand.identity,
			commandId: parsedCommand.commandId,
		});
		const decision = computeTrack({
			state,
			command: parsedCommand,
			existingReceipt,
			deduplicationExpiresAt: deduplicationExpiryOf({ receiptPolicy }),
		});
		if (decision.kind !== "new") return Promise.resolve(decision);

		const pendingCustomerCount =
			pendingCommandCountsByCustomerKey.get(customerKey) ?? 0;
		if (
			pendingCommandsByKey.size >= limits.maxPendingCommands ||
			pendingCustomerCount >= limits.maxPendingCommandsPerCustomer
		) {
			throw new PartitionTrackWriterCapacityError();
		}

		const projectedState = executeTrack({
			state,
			outcome: decision.outcome,
		}).state;
		const { promise, waiter } = createWaiter({ kind: "new" });
		const pending: PendingTrackCommand = {
			pendingKey,
			customerKey,
			outcome: decision.outcome,
			waiters: [waiter],
		};
		projectedStatesByCustomerKey.set(customerKey, projectedState);
		pendingCommandsByKey.set(pendingKey, pending);
		pendingCommandCountsByCustomerKey.set(
			customerKey,
			pendingCustomerCount + 1,
		);
		waitingCommands.push(pending);
		scheduleDrain();
		return promise;
	};

	return { submitTrack };
};
