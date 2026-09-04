import {
	type CheckCommand,
	type CheckDecision,
	computeCheck,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	parseCheckCommand,
	parseTrackCommand,
	type TrackCommand,
	type TrackDecision,
} from "@autumn/balance-engine";
import {
	type OwnedPartitionFollowerProgress,
	type OwnedPartitionHealth,
	ownedPartitionFailureReasonOf,
	ownedPartitionHealthOf,
} from "../health/ownedPartitionHealth.js";
import { createKafkaCommittedTrackOutcomeAppender } from "../kafka/kafkaCommittedTrackOutcomeAppender.js";
import type { KafkaOwnedPartitionProducerPort } from "../kafka/kafkaOwnedPartitionProducer.js";
import type { SqliteBalanceStateStore } from "../state/sqliteBalanceStateStore.js";
import {
	createPartitionTrackWriter,
	type PartitionTrackWriterLimits,
	type PartitionTrackWriterReceiptPolicy,
	PartitionTrackWriterRecoveryRequiredError,
} from "../writer/partitionTrackWriter.js";
import type { PartitionBootstrapResult } from "./bootstrap/partitionBootstrap.js";
import type { PartitionLogRange } from "./bootstrap/partitionBootstrapPlan.js";
import {
	createOwnedPartitionRecoveryError,
	isKafkaProducerFencingCause,
	OwnedPartitionMismatchError,
	OwnedPartitionNotReadyError,
	type OwnedPartitionRecoveryRequiredError,
	type OwnedPartitionRuntimeStatus,
	OwnedPartitionStateNotFoundError,
} from "./ownedPartitionErrors.js";
import { OwnedPartitionRequestTracker } from "./ownedPartitionRequestTracker.js";

export type { OwnedPartitionRuntimeStatus } from "./ownedPartitionErrors.js";
export {
	OwnedPartitionMismatchError,
	OwnedPartitionNotReadyError,
	OwnedPartitionProducerFencedError,
	OwnedPartitionRecoveryRequiredError,
	OwnedPartitionStateNotFoundError,
} from "./ownedPartitionErrors.js";

export type OwnedPartitionProducerPort = KafkaOwnedPartitionProducerPort;

export type PartitionOutcomeFollowerPort = {
	/**
	 * Reads one retained range after ownership fencing. The returned end offset is
	 * the startup readiness barrier; newer records may append while catch-up runs.
	 */
	readLogRange({
		topic,
		partition,
		signal,
	}: {
		topic: string;
		partition: number;
		signal: AbortSignal;
	}): Promise<PartitionLogRange>;
	/** Applies through targetNextOffset, then resolves while live following continues. */
	startAndCatchUp({
		topic,
		partition,
		targetNextOffset,
		onUnavailable,
	}: {
		topic: string;
		partition: number;
		targetNextOffset: bigint;
		onUnavailable: ({ cause }: { cause: unknown }) => void;
	}): Promise<void>;
	readProgress({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): OwnedPartitionFollowerProgress;
	/** Stops live following and settles any pending startAndCatchUp call. */
	stop(): Promise<void>;
};

export type OwnedPartitionBootstrapPort = {
	bootstrap({
		topic,
		partition,
		logRange,
		signal,
	}: {
		topic: string;
		partition: number;
		logRange: PartitionLogRange;
		signal: AbortSignal;
	}): Promise<PartitionBootstrapResult>;
};

export type MeteringPartitionResolver = {
	partitionForIdentity({ identity }: { identity: MeteringIdentity }): number;
};

const validateRuntimeConfiguration = ({
	topic,
	partition,
	recoveryDrainTimeoutMs,
}: {
	topic: string;
	partition: number;
	recoveryDrainTimeoutMs: number;
}): void => {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${partition}`);
	}
	if (
		!Number.isSafeInteger(recoveryDrainTimeoutMs) ||
		recoveryDrainTimeoutMs <= 0
	) {
		throw new RangeError(
			"recoveryDrainTimeoutMs must be a positive safe integer",
		);
	}
};

export const createOwnedPartitionRuntime = ({
	topic,
	partition,
	stateStore,
	producer,
	follower,
	bootstrapper,
	partitionResolver,
	writerLimits,
	trackReceiptPolicy,
	recoveryDrainTimeoutMs,
}: {
	topic: string;
	partition: number;
	stateStore: SqliteBalanceStateStore;
	producer: OwnedPartitionProducerPort;
	follower: PartitionOutcomeFollowerPort;
	bootstrapper: OwnedPartitionBootstrapPort;
	partitionResolver: MeteringPartitionResolver;
	writerLimits: PartitionTrackWriterLimits;
	trackReceiptPolicy: PartitionTrackWriterReceiptPolicy;
	recoveryDrainTimeoutMs: number;
}): {
	start(): Promise<void>;
	stop(): Promise<void>;
	getStatus(): OwnedPartitionRuntimeStatus;
	getHealth(): OwnedPartitionHealth;
	submitTrack({ command }: { command: TrackCommand }): Promise<TrackDecision>;
	check({ command }: { command: CheckCommand }): Promise<CheckDecision>;
} => {
	validateRuntimeConfiguration({ topic, partition, recoveryDrainTimeoutMs });

	const appender = createKafkaCommittedTrackOutcomeAppender({ producer });
	const writer = createPartitionTrackWriter({
		topic,
		partition,
		stateStore,
		appender,
		limits: writerLimits,
		receiptPolicy: trackReceiptPolicy,
	});
	const requestTracker = new OwnedPartitionRequestTracker();
	let status: OwnedPartitionRuntimeStatus = "created";
	let terminalError: OwnedPartitionRecoveryRequiredError | null = null;
	let failureReason: string | null = null;
	let producerConnectionAttempted = false;
	let followerStartAttempted = false;
	let startPromise: Promise<void> | null = null;
	let stopPromise: Promise<void> | null = null;
	let stopFollowerPromise: Promise<void> | null = null;
	let disconnectProducerPromise: Promise<void> | null = null;
	let recoveryPromise: Promise<OwnedPartitionRecoveryRequiredError> | null =
		null;
	const startupAbortController = new AbortController();
	const isDraining = (): boolean => status === "draining";
	const assertStartupContinues = (): void => {
		if (terminalError) throw terminalError;
		if (
			status !== "fencing" &&
			status !== "bootstrapping" &&
			status !== "catching_up"
		) {
			throw new OwnedPartitionNotReadyError({ status });
		}
	};

	const assertReady = (): void => {
		if (terminalError) throw terminalError;
		if (status !== "ready") throw new OwnedPartitionNotReadyError({ status });
	};

	const assertOwnedIdentity = ({
		commandIdentity,
	}: {
		commandIdentity: MeteringIdentity;
	}): string => {
		const actualPartition = partitionResolver.partitionForIdentity({
			identity: commandIdentity,
		});
		if (!Number.isSafeInteger(actualPartition) || actualPartition < 0) {
			throw new RangeError(
				`Partition resolver returned an invalid partition: ${actualPartition}`,
			);
		}
		const customerKey = meteringPartitionKeyOf({ identity: commandIdentity });
		if (actualPartition !== partition) {
			throw new OwnedPartitionMismatchError({
				customerKey,
				expectedPartition: partition,
				actualPartition,
			});
		}
		return customerKey;
	};

	const stopFollower = (): Promise<void> => {
		if (!followerStartAttempted) return Promise.resolve();
		stopFollowerPromise ??= follower.stop();
		return stopFollowerPromise;
	};

	const disconnectProducer = (): Promise<void> => {
		if (!producerConnectionAttempted) return Promise.resolve();
		disconnectProducerPromise ??= producer.disconnect();
		return disconnectProducerPromise;
	};

	const disposeResources = async (): Promise<void> => {
		const cleanupErrors: unknown[] = [];
		try {
			await stopFollower();
		} catch (error) {
			cleanupErrors.push(error);
		}
		try {
			await disconnectProducer();
		} catch (error) {
			cleanupErrors.push(error);
		}
		if (cleanupErrors.length > 0) {
			throw new AggregateError(
				cleanupErrors,
				`Failed to dispose owned partition ${topic}[${partition}]`,
			);
		}
	};

	const drainAcceptedWorkWithinRecoveryTimeout = async (): Promise<void> => {
		let timeout: ReturnType<typeof setTimeout> | null = null;
		try {
			await Promise.race([
				requestTracker.drain(),
				new Promise<void>((resolve) => {
					timeout = setTimeout(resolve, recoveryDrainTimeoutMs);
				}),
			]);
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	};

	const enterRecovery = ({
		cause,
		drainAcceptedWork = false,
	}: {
		cause: unknown;
		drainAcceptedWork?: boolean;
	}): Promise<OwnedPartitionRecoveryRequiredError> => {
		if (recoveryPromise) return recoveryPromise;
		const recoveryError = createOwnedPartitionRecoveryError({
			topic,
			partition,
			cause,
		});
		terminalError = recoveryError;
		failureReason = ownedPartitionFailureReasonOf({ cause });
		status = "recovery_required";
		startupAbortController.abort(recoveryError);
		recoveryPromise = Promise.resolve().then(async () => {
			try {
				if (drainAcceptedWork) {
					await drainAcceptedWorkWithinRecoveryTimeout();
				}
				await disposeResources();
				return recoveryError;
			} catch (cleanupCause) {
				const combinedCause = new AggregateError(
					[cause, cleanupCause],
					"Owned partition recovery cleanup failed",
				);
				const combinedError = createOwnedPartitionRecoveryError({
					topic,
					partition,
					cause: combinedCause,
				});
				terminalError = combinedError;
				return combinedError;
			}
		});
		return recoveryPromise;
	};

	const handleFollowerUnavailable = ({ cause }: { cause: unknown }): void => {
		if (
			status === "draining" ||
			status === "stopped" ||
			status === "recovery_required"
		) {
			return;
		}
		void enterRecovery({ cause, drainAcceptedWork: true });
	};

	const fencePreviousOwner = async (): Promise<void> => {
		const transaction = await producer.transaction();
		await transaction.abort();
	};

	const start = (): Promise<void> => {
		if (status !== "created") {
			return Promise.reject(new OwnedPartitionNotReadyError({ status }));
		}
		status = "fencing";
		startPromise = (async () => {
			try {
				producerConnectionAttempted = true;
				await producer.connect();
				assertStartupContinues();
				await fencePreviousOwner();
				assertStartupContinues();
				status = "bootstrapping";
				const logRange = await follower.readLogRange({
					topic,
					partition,
					signal: startupAbortController.signal,
				});
				assertStartupContinues();
				await bootstrapper.bootstrap({
					topic,
					partition,
					logRange,
					signal: startupAbortController.signal,
				});
				assertStartupContinues();
				status = "catching_up";
				followerStartAttempted = true;
				await follower.startAndCatchUp({
					topic,
					partition,
					targetNextOffset: logRange.logEndOffset,
					onUnavailable: handleFollowerUnavailable,
				});
				assertStartupContinues();
				status = "ready";
			} catch (cause) {
				if (terminalError) throw terminalError;
				if (isDraining()) {
					throw new OwnedPartitionNotReadyError({ status });
				}
				throw await enterRecovery({ cause });
			}
		})();
		return startPromise;
	};

	const stop = (): Promise<void> => {
		if (stopPromise) return stopPromise;
		if (status === "recovery_required") {
			return recoveryPromise?.then(() => undefined) ?? disposeResources();
		}
		if (status === "stopped") return Promise.resolve();
		if (status === "created") {
			status = "stopped";
			return Promise.resolve();
		}

		status = "draining";
		startupAbortController.abort(
			new OwnedPartitionNotReadyError({ status: "draining" }),
		);
		if (followerStartAttempted) void stopFollower().catch(() => undefined);
		stopPromise = (async () => {
			await startPromise?.catch(() => undefined);
			await requestTracker.drain();
			await disposeResources();
			status = terminalError ? "recovery_required" : "stopped";
		})();
		return stopPromise;
	};

	const submitTrack = ({
		command,
	}: {
		command: TrackCommand;
	}): Promise<TrackDecision> => {
		try {
			assertReady();
			const parsedCommand = parseTrackCommand({ input: command });
			const customerKey = assertOwnedIdentity({
				commandIdentity: parsedCommand.identity,
			});
			const operation = writer
				.submitTrack({ command: parsedCommand })
				.catch(async (cause: unknown) => {
					if (terminalError) throw terminalError;
					if (
						cause instanceof PartitionTrackWriterRecoveryRequiredError ||
						isKafkaProducerFencingCause({ cause })
					) {
						throw await enterRecovery({ cause });
					}
					throw cause;
				});
			return requestTracker.registerTrack({ customerKey, operation });
		} catch (error) {
			return Promise.reject(error);
		}
	};

	const check = ({
		command,
	}: {
		command: CheckCommand;
	}): Promise<CheckDecision> => {
		try {
			assertReady();
			const parsedCommand = parseCheckCommand({ input: command });
			const customerKey = assertOwnedIdentity({
				commandIdentity: parsedCommand.identity,
			});
			const precedingTracks = requestTracker.precedingTracks({ customerKey });
			const operation = (async (): Promise<CheckDecision> => {
				if (precedingTracks.length > 0) {
					await Promise.allSettled(precedingTracks);
					if (terminalError) throw terminalError;
				}
				const state = stateStore.readState({
					identity: parsedCommand.identity,
				});
				if (!state) throw new OwnedPartitionStateNotFoundError({ customerKey });
				return computeCheck({ state, command: parsedCommand });
			})();
			return requestTracker.register({ operation });
		} catch (error) {
			return Promise.reject(error);
		}
	};

	return {
		start,
		stop,
		getStatus: () => status,
		getHealth: () => {
			const progress = follower.readProgress({ topic, partition });
			return ownedPartitionHealthOf({
				topic,
				partition,
				status,
				localNextOffset: stateStore.readNextOffset({ topic, partition }),
				consumedNextOffset: progress.consumedNextOffset,
				highWatermark: progress.highWatermark,
				failureReason,
			});
		},
		submitTrack,
		check,
	};
};
