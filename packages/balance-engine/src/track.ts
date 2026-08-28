import { isDeepStrictEqual } from "node:util";
import { Decimal } from "decimal.js";
import {
	type BalanceBucket,
	type BalanceMutation,
	type DirectMeteredV1FeatureState,
	type MeteringState,
	type TrackCommand,
	type TrackDecision,
	type TrackOutcome,
	trackCommandFingerprintOf,
	trackOutcomeSchema,
} from "./contracts.js";
import { availableBalanceOf, balanceOf, identitiesMatch } from "./state.js";

export class ConflictingTrackReceiptError extends Error {
	constructor({ commandId }: { commandId: string }) {
		super(`Conflicting outcome for command ${commandId}`);
		this.name = "ConflictingTrackReceiptError";
	}
}

export class OutOfOrderTrackOutcomeError extends Error {
	constructor({
		stateRevision,
		outcomeRevision,
	}: {
		stateRevision: number;
		outcomeRevision: number;
	}) {
		super(
			`Cannot apply outcome at revision ${outcomeRevision} to state at revision ${stateRevision}`,
		);
		this.name = "OutOfOrderTrackOutcomeError";
	}
}

export class StaleTrackOutcomeError extends Error {
	constructor({ bucketId }: { bucketId: string }) {
		super(`Outcome does not match current bucket ${bucketId}`);
		this.name = "StaleTrackOutcomeError";
	}
}

export class TrackOutcomeSubjectMismatchError extends Error {
	constructor() {
		super("Outcome subject does not match the current state owner");
		this.name = "TrackOutcomeSubjectMismatchError";
	}
}

const receiptMatchesCommand = ({
	receipt,
	command,
}: {
	receipt: TrackOutcome;
	command: TrackCommand;
}): boolean =>
	receipt.commandId === command.commandId &&
	receipt.commandFingerprint === trackCommandFingerprintOf({ command });

const deductFromBuckets = ({
	buckets,
	value,
	overageBehavior,
}: {
	buckets: BalanceBucket[];
	value: Decimal;
	overageBehavior: TrackCommand["overageBehavior"];
}): { appliedValue: Decimal; mutations: BalanceMutation[] } => {
	const availableBalance = buckets.reduce(
		(total, bucket) => total.plus(Decimal.max(bucket.balance, 0)),
		new Decimal(0),
	);
	const appliedValue =
		overageBehavior === "cap" ? Decimal.min(value, availableBalance) : value;
	let remainingValue = appliedValue;
	const mutations: BalanceMutation[] = [];

	for (const bucket of buckets) {
		if (remainingValue.lte(0)) break;

		const bucketBalance = new Decimal(bucket.balance);
		const deductedValue = Decimal.min(
			remainingValue,
			Decimal.max(bucketBalance, 0),
		);
		if (deductedValue.lte(0)) continue;

		const balanceAfter = bucketBalance.minus(deductedValue);
		const usageAfter = new Decimal(bucket.usage).plus(deductedValue);
		mutations.push({
			bucketId: bucket.id,
			balanceBefore: bucket.balance,
			balanceAfter: balanceAfter.toNumber(),
			usageBefore: bucket.usage,
			usageAfter: usageAfter.toNumber(),
		});
		remainingValue = remainingValue.minus(deductedValue);
	}

	if (overageBehavior === "overflow" && remainingValue.gt(0)) {
		const overflowBucket = buckets.at(-1);
		if (!overflowBucket) return { appliedValue, mutations };

		const existingMutation = mutations.find(
			(mutation) => mutation.bucketId === overflowBucket.id,
		);
		const balanceBefore =
			existingMutation?.balanceBefore ?? overflowBucket.balance;
		const usageBefore = existingMutation?.usageBefore ?? overflowBucket.usage;
		const currentBalance = new Decimal(
			existingMutation?.balanceAfter ?? overflowBucket.balance,
		);
		const currentUsage = new Decimal(
			existingMutation?.usageAfter ?? overflowBucket.usage,
		);
		const overflowMutation: BalanceMutation = {
			bucketId: overflowBucket.id,
			balanceBefore,
			balanceAfter: currentBalance.minus(remainingValue).toNumber(),
			usageBefore,
			usageAfter: currentUsage.plus(remainingValue).toNumber(),
		};

		if (existingMutation) {
			mutations[mutations.indexOf(existingMutation)] = overflowMutation;
		} else {
			mutations.push(overflowMutation);
		}
	}

	return { appliedValue, mutations };
};

const balanceAfterMutations = ({
	feature,
	mutations,
}: {
	feature: DirectMeteredV1FeatureState;
	mutations: BalanceMutation[];
}): number => {
	const mutationByBucketId = new Map(
		mutations.map((mutation) => [mutation.bucketId, mutation]),
	);
	return feature.buckets
		.reduce(
			(total, bucket) =>
				total.plus(
					mutationByBucketId.get(bucket.id)?.balanceAfter ?? bucket.balance,
				),
			new Decimal(0),
		)
		.toNumber();
};

export const decideTrack = ({
	state,
	command,
	existingReceipt = null,
}: {
	state: MeteringState;
	command: TrackCommand;
	existingReceipt?: TrackOutcome | null;
}): TrackDecision => {
	if (!identitiesMatch({ left: state.identity, right: command.identity })) {
		return { kind: "unsupported", reason: "subject_mismatch" };
	}

	const receipt = existingReceipt
		? trackOutcomeSchema.parse(existingReceipt)
		: null;
	if (receipt) {
		return receiptMatchesCommand({ receipt, command })
			? { kind: "duplicate", outcome: receipt }
			: { kind: "unsupported", reason: "command_conflict" };
	}
	if (command.entityId) {
		return { kind: "unsupported", reason: "entity_not_supported" };
	}
	if (command.properties && Object.keys(command.properties).length > 0) {
		return { kind: "unsupported", reason: "properties_not_supported" };
	}
	if (command.value < 0) {
		return { kind: "unsupported", reason: "refund_not_supported" };
	}

	const feature = state.features[command.featureId];
	if (!feature) {
		return { kind: "unsupported", reason: "feature_not_found" };
	}
	if (feature.buckets.length !== 1) {
		return { kind: "unsupported", reason: "multiple_buckets_not_supported" };
	}

	const requestedValue = new Decimal(command.value);
	const balanceBefore = balanceOf({ feature });
	const availableBalance = availableBalanceOf({ feature });
	const rejected =
		command.overageBehavior === "reject" && availableBalance.lt(requestedValue);
	const { appliedValue, mutations } = rejected
		? { appliedValue: new Decimal(0), mutations: [] }
		: deductFromBuckets({
				buckets: feature.buckets,
				value: requestedValue,
				overageBehavior: command.overageBehavior,
			});

	const outcome = trackOutcomeSchema.parse({
		schemaVersion: 1,
		type: "track_outcome",
		commandId: command.commandId,
		commandFingerprint: trackCommandFingerprintOf({ command }),
		requestId: command.requestId,
		identity: command.identity,
		entityId: command.entityId,
		featureId: command.featureId,
		requestedValue: command.value,
		appliedValue: appliedValue.toNumber(),
		overageBehavior: command.overageBehavior,
		properties: command.properties,
		status: rejected ? "rejected" : "applied",
		reason: rejected ? "insufficient_balance" : null,
		balanceBefore,
		balanceAfter: rejected
			? balanceBefore
			: balanceAfterMutations({ feature, mutations }),
		revisionBefore: state.revision,
		revisionAfter: state.revision + 1,
		mutations,
		occurredAt: command.occurredAt,
	});

	return { kind: "new", outcome };
};

const applyBalanceMutations = ({
	feature,
	mutations,
}: {
	feature: DirectMeteredV1FeatureState;
	mutations: BalanceMutation[];
}): DirectMeteredV1FeatureState => {
	const mutationByBucketId = new Map(
		mutations.map((mutation) => [mutation.bucketId, mutation]),
	);
	if (mutationByBucketId.size !== mutations.length) {
		throw new StaleTrackOutcomeError({ bucketId: "duplicate" });
	}
	for (const mutation of mutations) {
		const bucket = feature.buckets.find(
			(candidate) => candidate.id === mutation.bucketId,
		);
		if (
			!bucket ||
			!new Decimal(bucket.balance).eq(mutation.balanceBefore) ||
			!new Decimal(bucket.usage).eq(mutation.usageBefore)
		) {
			throw new StaleTrackOutcomeError({ bucketId: mutation.bucketId });
		}
	}

	return {
		kind: "direct_metered_v1",
		buckets: feature.buckets.map((bucket) => {
			const mutation = mutationByBucketId.get(bucket.id);
			if (!mutation) return bucket;
			return {
				id: bucket.id,
				balance: mutation.balanceAfter,
				usage: mutation.usageAfter,
			};
		}),
	};
};

export const applyTrackOutcome = ({
	state,
	outcome,
	existingReceipt = null,
}: {
	state: MeteringState;
	outcome: TrackOutcome;
	existingReceipt?: TrackOutcome | null;
}): {
	kind: "applied" | "duplicate";
	state: MeteringState;
	receipt: TrackOutcome;
} => {
	const parsedOutcome = trackOutcomeSchema.parse(outcome);

	if (
		!identitiesMatch({ left: state.identity, right: parsedOutcome.identity })
	) {
		throw new TrackOutcomeSubjectMismatchError();
	}

	if (existingReceipt) {
		const parsedReceipt = trackOutcomeSchema.parse(existingReceipt);
		if (!isDeepStrictEqual(parsedReceipt, parsedOutcome)) {
			throw new ConflictingTrackReceiptError({
				commandId: parsedOutcome.commandId,
			});
		}
		return { kind: "duplicate", state, receipt: parsedReceipt };
	}

	if (
		parsedOutcome.revisionBefore !== state.revision ||
		parsedOutcome.revisionAfter !== state.revision + 1
	) {
		throw new OutOfOrderTrackOutcomeError({
			stateRevision: state.revision,
			outcomeRevision: parsedOutcome.revisionBefore,
		});
	}

	const feature = state.features[parsedOutcome.featureId];
	if (!feature) {
		throw new StaleTrackOutcomeError({ bucketId: parsedOutcome.featureId });
	}
	if (!new Decimal(balanceOf({ feature })).eq(parsedOutcome.balanceBefore)) {
		throw new StaleTrackOutcomeError({ bucketId: parsedOutcome.featureId });
	}

	const nextFeature = applyBalanceMutations({
		feature,
		mutations: parsedOutcome.mutations,
	});
	if (
		!new Decimal(balanceOf({ feature: nextFeature })).eq(
			parsedOutcome.balanceAfter,
		)
	) {
		throw new StaleTrackOutcomeError({ bucketId: parsedOutcome.featureId });
	}
	const nextState: MeteringState = {
		schemaVersion: 1,
		identity: state.identity,
		revision: parsedOutcome.revisionAfter,
		features:
			parsedOutcome.mutations.length === 0
				? state.features
				: { ...state.features, [parsedOutcome.featureId]: nextFeature },
	};

	return { kind: "applied", state: nextState, receipt: parsedOutcome };
};
