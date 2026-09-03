import { Decimal } from "decimal.js";
import { z } from "zod/v4";

const nonEmptyStringSchema = z.string().min(1);

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number().finite(),
		z.boolean(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);
const propertiesSchema = z.record(z.string(), jsonValueSchema).nullable();

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
		deduplicationExpiresAt: z.number().int().nonnegative(),
	})
	.strict();

export type TrackCommand = z.infer<typeof trackCommandSchema>;

const canonicalizeJsonValue = (value: JsonValue): JsonValue => {
	if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
	if (value === null || typeof value !== "object") return value;

	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([key, entry]) => [key, canonicalizeJsonValue(entry)]),
	);
};

export const trackCommandFingerprintOf = ({
	command,
}: {
	command: TrackCommand;
}): string =>
	JSON.stringify([
		command.identity.orgId,
		command.identity.env,
		command.identity.customerId,
		command.entityId,
		command.featureId,
		new Decimal(command.value).toString(),
		command.overageBehavior,
		command.properties && Object.keys(command.properties).length > 0
			? canonicalizeJsonValue(command.properties)
			: null,
	]);

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
		customerEntitlementId: nonEmptyStringSchema,
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
		commandFingerprint: nonEmptyStringSchema,
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
		deduplicationExpiresAt: z.number().int().nonnegative(),
	})
	.strict()
	.superRefine((outcome, context) => {
		const expectedCommandFingerprint = trackCommandFingerprintOf({
			command: {
				schemaVersion: 1,
				type: "track",
				commandId: outcome.commandId,
				requestId: outcome.requestId,
				identity: outcome.identity,
				entityId: outcome.entityId,
				featureId: outcome.featureId,
				value: outcome.requestedValue,
				overageBehavior: outcome.overageBehavior,
				properties: outcome.properties,
				occurredAt: outcome.occurredAt,
				deduplicationExpiresAt: outcome.deduplicationExpiresAt,
			},
		});
		if (outcome.commandFingerprint !== expectedCommandFingerprint) {
			context.addIssue({
				code: "custom",
				message: "commandFingerprint must match the decision inputs",
				path: ["commandFingerprint"],
			});
		}

		if (outcome.revisionAfter !== outcome.revisionBefore + 1) {
			context.addIssue({
				code: "custom",
				message: "revisionAfter must follow revisionBefore",
				path: ["revisionAfter"],
			});
		}

		const mutationCustomerEntitlementIds = new Set<string>();
		let mutationBalanceDelta = new Decimal(0);
		let mutationUsageDelta = new Decimal(0);
		for (const [index, mutation] of outcome.mutations.entries()) {
			if (mutationCustomerEntitlementIds.has(mutation.customerEntitlementId)) {
				context.addIssue({
					code: "custom",
					message: `Duplicate mutation customer entitlement id: ${mutation.customerEntitlementId}`,
					path: ["mutations", index, "customerEntitlementId"],
				});
			}
			mutationCustomerEntitlementIds.add(mutation.customerEntitlementId);

			const balanceDelta = new Decimal(mutation.balanceBefore).minus(
				mutation.balanceAfter,
			);
			const usageDelta = new Decimal(mutation.usageAfter).minus(
				mutation.usageBefore,
			);
			if (
				balanceDelta.lt(0) ||
				usageDelta.lt(0) ||
				!balanceDelta.eq(usageDelta)
			) {
				context.addIssue({
					code: "custom",
					message: "Mutation balance and usage deltas must match",
					path: ["mutations", index],
				});
			}
			mutationBalanceDelta = mutationBalanceDelta.plus(balanceDelta);
			mutationUsageDelta = mutationUsageDelta.plus(usageDelta);
		}

		const appliedValue = new Decimal(outcome.appliedValue);
		if (!mutationBalanceDelta.eq(appliedValue)) {
			context.addIssue({
				code: "custom",
				message: "Mutation balance deltas must sum to appliedValue",
				path: ["mutations"],
			});
		}
		if (!mutationUsageDelta.eq(appliedValue)) {
			context.addIssue({
				code: "custom",
				message: "Mutation usage deltas must sum to appliedValue",
				path: ["mutations"],
			});
		}
		if (
			!new Decimal(outcome.balanceBefore)
				.minus(outcome.balanceAfter)
				.eq(appliedValue)
		) {
			context.addIssue({
				code: "custom",
				message: "Outcome balance delta must equal appliedValue",
				path: ["balanceAfter"],
			});
		}
		if (appliedValue.gt(outcome.requestedValue)) {
			context.addIssue({
				code: "custom",
				message: "appliedValue cannot exceed requestedValue",
				path: ["appliedValue"],
			});
		}
		if (
			outcome.overageBehavior === "cap" &&
			appliedValue.gt(Decimal.max(outcome.balanceBefore, 0))
		) {
			context.addIssue({
				code: "custom",
				message: "Capped outcomes cannot exceed available balance",
				path: ["appliedValue"],
			});
		}

		if (outcome.status === "rejected") {
			if (
				outcome.reason !== "insufficient_balance" ||
				outcome.overageBehavior !== "reject" ||
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
		} else {
			if (outcome.reason !== null) {
				context.addIssue({
					code: "custom",
					message: "Applied outcomes cannot have a rejection reason",
					path: ["reason"],
				});
			}
			if (
				outcome.overageBehavior !== "cap" &&
				!appliedValue.eq(outcome.requestedValue)
			) {
				context.addIssue({
					code: "custom",
					message: "Non-capped applied outcomes must apply the requested value",
					path: ["appliedValue"],
				});
			}
		}
	});

export type TrackOutcome = z.infer<typeof trackOutcomeSchema>;

const leanCustomerEntitlementSchema = z
	.object({
		id: nonEmptyStringSchema,
		balance: z.number().finite(),
		usage: z.number().finite().nonnegative(),
	})
	.strict();

export type LeanCustomerEntitlement = z.infer<
	typeof leanCustomerEntitlementSchema
>;

export const directMeteredV1FeatureStateSchema = z
	.object({
		kind: z.literal("direct_metered_v1"),
		customerEntitlements: z.array(leanCustomerEntitlementSchema).min(1),
	})
	.strict()
	.superRefine(({ customerEntitlements }, context) => {
		const customerEntitlementIds = new Set<string>();
		for (const [index, customerEntitlement] of customerEntitlements.entries()) {
			if (customerEntitlementIds.has(customerEntitlement.id)) {
				context.addIssue({
					code: "custom",
					message: `Duplicate customer entitlement id: ${customerEntitlement.id}`,
					path: ["customerEntitlements", index, "id"],
				});
			}
			customerEntitlementIds.add(customerEntitlement.id);
		}
	});

export type DirectMeteredV1FeatureState = z.infer<
	typeof directMeteredV1FeatureStateSchema
>;

export const customerMeteringStateSchema = z
	.object({
		schemaVersion: z.literal(1),
		identity: meteringIdentitySchema,
		revision: z.number().int().nonnegative(),
		featureStatesById: z.record(
			nonEmptyStringSchema,
			directMeteredV1FeatureStateSchema,
		),
	})
	.strict();

export type CustomerMeteringState = z.infer<typeof customerMeteringStateSchema>;

export const stateInitializedEventSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("state_initialized"),
		initializationId: nonEmptyStringSchema,
		initializedAt: z.number().int().nonnegative(),
		state: customerMeteringStateSchema,
	})
	.strict()
	.superRefine(({ state }, context) => {
		if (state.revision !== 0) {
			context.addIssue({
				code: "custom",
				message: "Initial metering state must start at revision zero",
				path: ["state", "revision"],
			});
		}
	});

export type StateInitializedEvent = z.infer<typeof stateInitializedEventSchema>;

export const stateInitializationFingerprintOf = ({
	initialization,
}: {
	initialization: StateInitializedEvent;
}): string =>
	JSON.stringify([
		initialization.state.identity.orgId,
		initialization.state.identity.env,
		initialization.state.identity.customerId,
		initialization.state.revision,
		Object.entries(initialization.state.featureStatesById)
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([featureId, featureState]) => [
				featureId,
				featureState.kind,
				featureState.customerEntitlements.map((customerEntitlement) => [
					customerEntitlement.id,
					new Decimal(customerEntitlement.balance).toString(),
					new Decimal(customerEntitlement.usage).toString(),
				]),
			]),
	]);

export type UnsupportedDecisionReason =
	| "command_conflict"
	| "entity_not_supported"
	| "feature_not_found"
	| "multiple_customer_entitlements_not_supported"
	| "properties_not_supported"
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
				| "multiple_customer_entitlements_not_supported"
				| "properties_not_supported"
				| "subject_mismatch";
	  };
