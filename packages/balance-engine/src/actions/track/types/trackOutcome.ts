import { Decimal } from "decimal.js";
import { z } from "zod/v4";
import { balanceMutationSchema } from "../../../common/types/balanceMutation.js";
import { propertiesSchema } from "../../../common/types/jsonValue.js";
import { meteringIdentitySchema } from "../../../common/types/meteringIdentity.js";
import { nonEmptyStringSchema } from "../../../common/types/schemaUtils.js";
import { trackCommandFingerprintOf } from "./trackCommand.js";

// The durable event a decision produces and the fold applies. It crosses the
// wire (Kafka) and doubles as the idempotency receipt, so the schema
// cross-checks its own arithmetic: a forged or corrupted outcome fails at
// parse time, before it can touch state.
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
		requestedValue: z.number().positive(),
		appliedValue: z.number().nonnegative(),
		overageBehavior: z.enum(["cap", "reject", "overflow"]),
		properties: propertiesSchema,
		status: z.enum(["applied", "rejected"]),
		reason: z.literal("insufficient_balance").nullable(),
		balanceBefore: z.number(),
		balanceAfter: z.number(),
		revisionBefore: z.number().int().nonnegative(),
		revisionAfter: z.number().int().positive(),
		mutations: z.array(balanceMutationSchema),
		occurredAt: z.number().int().nonnegative(),
	})
	.strict()
	.check((ctx) => {
		const outcome = ctx.value;
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
			},
		});
		if (outcome.commandFingerprint !== expectedCommandFingerprint) {
			ctx.issues.push({
				code: "custom",
				message: "commandFingerprint must match the decision inputs",
				path: ["commandFingerprint"],
				input: outcome,
				});
		}

		if (outcome.revisionAfter !== outcome.revisionBefore + 1) {
			ctx.issues.push({
				code: "custom",
				message: "revisionAfter must follow revisionBefore",
				path: ["revisionAfter"],
				input: outcome,
				});
		}

		const mutationCustomerEntitlementIds = new Set<string>();
		let mutationBalanceDelta = new Decimal(0);
		let mutationUsageDelta = new Decimal(0);
		for (const [index, mutation] of outcome.mutations.entries()) {
			if (mutationCustomerEntitlementIds.has(mutation.customerEntitlementId)) {
				ctx.issues.push({
					code: "custom",
					message: `Duplicate mutation customer entitlement id: ${mutation.customerEntitlementId}`,
					path: ["mutations", index, "customerEntitlementId"],
					input: outcome,
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
				ctx.issues.push({
					code: "custom",
					message: "Mutation balance and usage deltas must match",
					path: ["mutations", index],
					input: outcome,
					});
			}
			mutationBalanceDelta = mutationBalanceDelta.plus(balanceDelta);
			mutationUsageDelta = mutationUsageDelta.plus(usageDelta);
		}

		const appliedValue = new Decimal(outcome.appliedValue);
		if (!mutationBalanceDelta.eq(appliedValue)) {
			ctx.issues.push({
				code: "custom",
				message: "Mutation balance deltas must sum to appliedValue",
				path: ["mutations"],
				input: outcome,
				});
		}
		if (!mutationUsageDelta.eq(appliedValue)) {
			ctx.issues.push({
				code: "custom",
				message: "Mutation usage deltas must sum to appliedValue",
				path: ["mutations"],
				input: outcome,
				});
		}
		if (
			!new Decimal(outcome.balanceBefore)
				.minus(outcome.balanceAfter)
				.eq(appliedValue)
		) {
			ctx.issues.push({
				code: "custom",
				message: "Outcome balance delta must equal appliedValue",
				path: ["balanceAfter"],
				input: outcome,
				});
		}
		if (appliedValue.gt(outcome.requestedValue)) {
			ctx.issues.push({
				code: "custom",
				message: "appliedValue cannot exceed requestedValue",
				path: ["appliedValue"],
				input: outcome,
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
				ctx.issues.push({
					code: "custom",
					message: "Rejected outcomes cannot change balance state",
					path: ["status"],
					input: outcome,
					});
			}
		} else {
			if (outcome.reason !== null) {
				ctx.issues.push({
					code: "custom",
					message: "Applied outcomes cannot have a rejection reason",
					path: ["reason"],
					input: outcome,
					});
			}
			if (
				outcome.overageBehavior !== "cap" &&
				!appliedValue.eq(outcome.requestedValue)
			) {
				ctx.issues.push({
					code: "custom",
					message: "Non-capped applied outcomes must apply the requested value",
					path: ["appliedValue"],
					input: outcome,
					});
			}
		}
	});

export type TrackOutcome = z.infer<typeof trackOutcomeSchema>;
