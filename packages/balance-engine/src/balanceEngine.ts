import { isDeepStrictEqual } from "node:util";
import { Decimal } from "decimal.js";
import { z } from "zod/v4";

const nonEmptyStringSchema = z.string().min(1);
const propertiesSchema = z.record(z.string(), z.unknown()).nullable();

export const meteringIdentitySchema = z
	.object({
		orgId: nonEmptyStringSchema,
		env: nonEmptyStringSchema,
		customerId: nonEmptyStringSchema,
	})
	.strict();

export type MeteringIdentity = z.infer<typeof meteringIdentitySchema>;

export const trackCommandSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("track"),
		commandId: nonEmptyStringSchema,
		requestId: nonEmptyStringSchema,
		identity: meteringIdentitySchema,
		entityId: nonEmptyStringSchema.nullable(),
		featureId: nonEmptyStringSchema,
		value: z
			.number()
			.finite()
			.refine((value) => value !== 0),
		overageBehavior: z.enum(["cap", "reject", "overflow"]),
		properties: propertiesSchema,
		occurredAt: z.number().int().nonnegative(),
	})
	.strict();

export type TrackCommand = z.infer<typeof trackCommandSchema>;

export const checkCommandSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("check"),
		requestId: nonEmptyStringSchema,
		identity: meteringIdentitySchema,
		entityId: nonEmptyStringSchema.nullable(),
		featureId: nonEmptyStringSchema,
		requiredBalance: z.number().finite(),
		properties: propertiesSchema,
		occurredAt: z.number().int().nonnegative(),
	})
	.strict();

export type CheckCommand = z.infer<typeof checkCommandSchema>;

const balanceMutationSchema = z
	.object({
		bucketId: nonEmptyStringSchema,
		balanceBefore: z.number().finite(),
		balanceAfter: z.number().finite(),
		usageBefore: z.number().finite().nonnegative(),
		usageAfter: z.number().finite().nonnegative(),
	})
	.strict();

export type BalanceMutation = z.infer<typeof balanceMutationSchema>;

export const trackOutcomeSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("track_outcome"),
		commandId: nonEmptyStringSchema,
		requestId: nonEmptyStringSchema,
		identity: meteringIdentitySchema,
		entityId: nonEmptyStringSchema.nullable(),
		featureId: nonEmptyStringSchema,
		requestedValue: z.number().finite().positive(),
		appliedValue: z.number().finite().nonnegative(),
		overageBehavior: z.enum(["cap", "reject", "overflow"]),
		properties: propertiesSchema,
		status: z.enum(["applied", "rejected"]),
		reason: z.literal("insufficient_balance").nullable(),
		balanceBefore: z.number().finite(),
		balanceAfter: z.number().finite(),
		revisionBefore: z.number().int().nonnegative(),
		revisionAfter: z.number().int().positive(),
		mutations: z.array(balanceMutationSchema),
		occurredAt: z.number().int().nonnegative(),
	})
	.strict()
	.superRefine((outcome, context) => {
		if (outcome.revisionAfter !== outcome.revisionBefore + 1) {
			context.addIssue({
				code: "custom",
				message: "revisionAfter must follow revisionBefore",
				path: ["revisionAfter"],
			});
		}

		const mutationBucketIds = new Set<string>();
		for (const [index, mutation] of outcome.mutations.entries()) {
			if (mutationBucketIds.has(mutation.bucketId)) {
				context.addIssue({
					code: "custom",
					message: `Duplicate mutation bucket id: ${mutation.bucketId}`,
					path: ["mutations", index, "bucketId"],
				});
			}
			mutationBucketIds.add(mutation.bucketId);
		}

		if (outcome.status === "rejected") {
			if (
				outcome.reason !== "insufficient_balance" ||
				outcome.appliedValue !== 0 ||
				outcome.mutations.length !== 0 ||
				outcome.balanceAfter !== outcome.balanceBefore
			) {
				context.addIssue({
					code: "custom",
					message: "Rejected outcomes cannot change balance state",
					path: ["status"],
				});
			}
		} else if (outcome.reason !== null) {
			context.addIssue({
				code: "custom",
				message: "Applied outcomes cannot have a rejection reason",
				path: ["reason"],
			});
		}
	});

export type TrackOutcome = z.infer<typeof trackOutcomeSchema>;

const balanceBucketSchema = z
	.object({
		id: nonEmptyStringSchema,
		balance: z.number().finite(),
		usage: z.number().finite().nonnegative(),
	})
	.strict();

export type BalanceBucket = z.infer<typeof balanceBucketSchema>;

const meteredFeatureStateSchema = z
	.object({
		kind: z.literal("metered"),
		buckets: z.array(balanceBucketSchema).min(1),
	})
	.strict()
	.superRefine(({ buckets }, context) => {
		const bucketIds = new Set<string>();
		for (const [index, bucket] of buckets.entries()) {
			if (bucketIds.has(bucket.id)) {
				context.addIssue({
					code: "custom",
					message: `Duplicate bucket id: ${bucket.id}`,
					path: ["buckets", index, "id"],
				});
			}
			bucketIds.add(bucket.id);
		}
	});

export type MeteredFeatureState = z.infer<typeof meteredFeatureStateSchema>;

export const meteringStateSchema = z
	.object({
		schemaVersion: z.literal(1),
		identity: meteringIdentitySchema,
		revision: z.number().int().nonnegative(),
		features: z.record(nonEmptyStringSchema, meteredFeatureStateSchema),
		receipts: z.record(nonEmptyStringSchema, trackOutcomeSchema),
	})
	.strict();

export type MeteringState = z.infer<typeof meteringStateSchema>;

export type UnsupportedDecisionReason =
	| "command_conflict"
	| "entity_not_supported"
	| "feature_not_found"
	| "multiple_buckets_not_supported"
	| "refund_not_supported"
	| "subject_mismatch";

export type TrackDecision =
	| { kind: "new"; outcome: TrackOutcome }
	| { kind: "duplicate"; outcome: TrackOutcome }
	| { kind: "unsupported"; reason: UnsupportedDecisionReason };

export type CheckDecision =
	| {
			kind: "decided";
			allowed: boolean;
			reason: "insufficient_balance" | null;
			balance: number;
			requiredBalance: number;
			revision: number;
	  }
	| {
			kind: "unsupported";
			reason:
				| "entity_not_supported"
				| "feature_not_found"
				| "multiple_buckets_not_supported"
				| "subject_mismatch";
	  };

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

export const parseTrackCommand = ({
	input,
}: {
	input: unknown;
}): TrackCommand => trackCommandSchema.parse(input);

export const parseCheckCommand = ({
	input,
}: {
	input: unknown;
}): CheckCommand => checkCommandSchema.parse(input);

export const parseTrackOutcome = ({
	input,
}: {
	input: unknown;
}): TrackOutcome => trackOutcomeSchema.parse(input);

export const createMeteringState = ({
	identity,
	features,
}: {
	identity: MeteringIdentity;
	features: Record<string, MeteredFeatureState>;
}): MeteringState =>
	meteringStateSchema.parse({
		schemaVersion: 1,
		identity,
		revision: 0,
		features,
		receipts: {},
	});

export const meteringPartitionKeyOf = ({
	identity,
}: {
	identity: MeteringIdentity;
}): string =>
	JSON.stringify([identity.orgId, identity.env, identity.customerId]);

export const shadowComparisonKeyOf = ({
	command,
}: {
	command: TrackCommand;
}): string =>
	JSON.stringify([
		command.identity.orgId,
		command.identity.env,
		command.identity.customerId,
		command.featureId,
		command.commandId,
	]);

const identitiesMatch = ({
	left,
	right,
}: {
	left: MeteringIdentity;
	right: MeteringIdentity;
}): boolean =>
	left.orgId === right.orgId &&
	left.env === right.env &&
	left.customerId === right.customerId;

const balanceOf = ({ feature }: { feature: MeteredFeatureState }): number =>
	feature.buckets
		.reduce((total, bucket) => total.plus(bucket.balance), new Decimal(0))
		.toNumber();

const availableBalanceOf = ({
	feature,
}: {
	feature: MeteredFeatureState;
}): Decimal =>
	feature.buckets.reduce(
		(total, bucket) => total.plus(Decimal.max(bucket.balance, 0)),
		new Decimal(0),
	);

export const evaluateCheck = ({
	state,
	command,
}: {
	state: MeteringState;
	command: CheckCommand;
}): CheckDecision => {
	if (!identitiesMatch({ left: state.identity, right: command.identity })) {
		return { kind: "unsupported", reason: "subject_mismatch" };
	}
	if (command.entityId) {
		return { kind: "unsupported", reason: "entity_not_supported" };
	}

	const feature = state.features[command.featureId];
	if (!feature) {
		return { kind: "unsupported", reason: "feature_not_found" };
	}
	if (feature.buckets.length !== 1) {
		return { kind: "unsupported", reason: "multiple_buckets_not_supported" };
	}

	const balance = balanceOf({ feature });
	const allowed =
		command.requiredBalance <= 0 ||
		availableBalanceOf({ feature }).gte(command.requiredBalance);

	return {
		kind: "decided",
		allowed,
		reason: allowed ? null : "insufficient_balance",
		balance,
		requiredBalance: command.requiredBalance,
		revision: state.revision,
	};
};

const receiptMatchesCommand = ({
	receipt,
	command,
}: {
	receipt: TrackOutcome;
	command: TrackCommand;
}): boolean =>
	receipt.commandId === command.commandId &&
	receipt.requestId === command.requestId &&
	identitiesMatch({ left: receipt.identity, right: command.identity }) &&
	receipt.entityId === command.entityId &&
	receipt.featureId === command.featureId &&
	new Decimal(receipt.requestedValue).eq(command.value) &&
	receipt.overageBehavior === command.overageBehavior &&
	isDeepStrictEqual(receipt.properties, command.properties) &&
	receipt.occurredAt === command.occurredAt;

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
	feature: MeteredFeatureState;
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
}: {
	state: MeteringState;
	command: TrackCommand;
}): TrackDecision => {
	if (!identitiesMatch({ left: state.identity, right: command.identity })) {
		return { kind: "unsupported", reason: "subject_mismatch" };
	}

	const receipt = state.receipts[command.commandId];
	if (receipt) {
		return receiptMatchesCommand({ receipt, command })
			? { kind: "duplicate", outcome: receipt }
			: { kind: "unsupported", reason: "command_conflict" };
	}
	if (command.entityId) {
		return { kind: "unsupported", reason: "entity_not_supported" };
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
	feature: MeteredFeatureState;
	mutations: BalanceMutation[];
}): MeteredFeatureState => {
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
		kind: "metered",
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
}: {
	state: MeteringState;
	outcome: TrackOutcome;
}): { kind: "applied" | "duplicate"; state: MeteringState } => {
	const parsedOutcome = trackOutcomeSchema.parse(outcome);

	if (
		!identitiesMatch({ left: state.identity, right: parsedOutcome.identity })
	) {
		throw new TrackOutcomeSubjectMismatchError();
	}

	const existingReceipt = state.receipts[parsedOutcome.commandId];
	if (existingReceipt) {
		if (!isDeepStrictEqual(existingReceipt, parsedOutcome)) {
			throw new ConflictingTrackReceiptError({
				commandId: parsedOutcome.commandId,
			});
		}
		return { kind: "duplicate", state };
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
		receipts: {
			...state.receipts,
			[parsedOutcome.commandId]: parsedOutcome,
		},
	};

	return { kind: "applied", state: nextState };
};
