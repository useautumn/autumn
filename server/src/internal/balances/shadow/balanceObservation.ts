import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";

const balanceSnapshotSchema = z.strictObject({
	customerEntitlementId: z.string().min(1),
	balance: z.number().nonnegative(),
	adjustment: z.number(),
	additionalBalance: z.literal(0),
	nextResetAt: z.number().nullable(),
	expiresAt: z.number().nullable(),
});

export const balanceObservationSchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		source: z.literal("redis"),
		orgId: z.string().min(1),
		env: z.enum(AppEnv),
		customerId: z.string().min(1),
		featureId: z.string().min(1),
		requestId: z.string().min(1),
		epoch: z.number().int().nonnegative(),
		incarnation: z.uuid(),
		sequence: z
			.string()
			.regex(/^[1-9]\d{0,15}$/)
			.refine((value) => Number.isSafeInteger(Number(value))),
		kind: z.enum([
			"deduct",
			"refund",
			"set",
			"adjust",
			"reserve",
			"finalize",
			"unwind",
			"skip",
			"unsupported",
		]),
		decision: z.enum(["applied", "capped", "rejected"]),
		reason: z.string().nullable(),
		requestedValue: z.number().nullable(),
		targetBalance: z.number().nullable(),
		overageBehavior: z.enum(["cap", "reject", "allow", "overflow"]),
		before: balanceSnapshotSchema.nullable(),
		after: balanceSnapshotSchema.nullable(),
	})
	.refine(
		(observation) =>
			observation.kind === "deduct"
				? observation.before !== null &&
					observation.after !== null &&
					observation.before.customerEntitlementId ===
						observation.after.customerEntitlementId
				: observation.before === null && observation.after === null,
		{ message: "Only direct deductions carry balance snapshots" },
	);

export type BalanceObservation = z.infer<typeof balanceObservationSchema>;
export type BalanceObservationIdentity = Pick<
	BalanceObservation,
	"orgId" | "env" | "customerId"
>;
export type BalanceObservationContext = BalanceObservationIdentity &
	Pick<BalanceObservation, "featureId" | "requestId">;

export type BalanceObservationCapture = {
	select: (
		identity: BalanceObservationIdentity,
	) => ReadonlySet<string> | undefined;
	// This port only admits a synchronous bounded enqueue, never delivery I/O.
	tryEnqueue: (observation: BalanceObservation) => boolean;
	onUnavailable: (
		failure: BalanceObservationContext & { reason: string },
	) => void;
};
