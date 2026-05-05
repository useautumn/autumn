import { MultiPlanInstanceSchema } from "@api/billing/common/multi/multiPlanInstance";
import { z } from "zod/v4";

/**
 * Per-plan sync intent. Extends the shared `MultiPlanInstance` with
 * sync-specific overrides.
 */
export const SyncPlanInstanceSchema = MultiPlanInstanceSchema.extend({
	quantity: z.number().int().min(1).optional().meta({
		description:
			"Number of customer product instances to create from this plan entry. Defaults to 1. Used to express add-ons with quantity > 1.",
	}),
	internal_entity_id: z.string().optional().meta({
		description:
			"If set, the resulting customer product is bound to this entity.",
		internal: true,
	}),
	expire_previous: z.boolean().optional().meta({
		description:
			"If true, expire the customer's existing active customer product of the same plan family at sync time.",
	}),
});

/**
 * One phase of plan instances. Use `starts_at: "now"` for the immediate
 * phase; numeric `starts_at` for future-dated phases. The first entry of
 * a SyncParamsV1 `phases` array typically carries `"now"`.
 */
export const SyncPhaseSchema = z.object({
	starts_at: z.union([z.number(), z.literal("now")]).meta({
		description:
			"Phase start (ms epoch) or the literal 'now' for the immediate phase.",
	}),
	plans: z.array(SyncPlanInstanceSchema).min(1).meta({
		description: "Plans to attach in this phase.",
	}),
});

const isPhasesOrdered = (
	phases: z.infer<typeof SyncPhaseSchema>[],
): boolean => {
	let lastNumeric: number | null = null;
	for (let i = 0; i < phases.length; i++) {
		const entry = phases[i];
		if (!entry) continue;
		// "now" is only allowed as the first entry
		if (entry.starts_at === "now") {
			if (i !== 0) return false;
			continue;
		}
		if (lastNumeric !== null && entry.starts_at <= lastNumeric) return false;
		lastNumeric = entry.starts_at;
	}
	return true;
};

/**
 * Inputs to the sync-to-Autumn action.
 *
 * - `phases` omitted    → pure auto-sync (run detection, use what it finds).
 * - `phases` supplied   → caller-specified plan instances; layered on top
 *                          of detection. First entry with `starts_at: "now"`
 *                          is the immediate phase.
 *
 * `acknowledge_warnings` whitelists detection warning types the caller
 * accepts. Empty / omitted = strict (any detection warning fails).
 */
export const SyncParamsV1Schema = z
	.object({
		customer_id: z.string().meta({
			description: "Autumn customer to sync into.",
		}),

		stripe_subscription_id: z.string().optional().meta({
			description: "Stripe subscription to sync from.",
		}),
		stripe_schedule_id: z.string().optional().meta({
			description:
				"Stripe subscription schedule to sync from (for future-dated schedules with no live subscription yet).",
		}),

		phases: z.array(SyncPhaseSchema).optional().meta({
			description:
				"Caller-supplied plan instances grouped by phase. Omit for pure auto-sync.",
		}),

		acknowledge_warnings: z.array(z.string()).optional().meta({
			description:
				"Detection warning types the caller accepts (e.g. 'extra_items_under_plan').",
		}),
	})
	.refine(
		(d) =>
			d.stripe_subscription_id !== undefined ||
			d.stripe_schedule_id !== undefined,
		{
			message:
				"Either stripe_subscription_id or stripe_schedule_id is required",
			path: ["stripe_subscription_id"],
		},
	)
	.refine((d) => !d.phases || isPhasesOrdered(d.phases), {
		message:
			"phases entries must be ordered: 'now' may only appear as the first entry, and remaining starts_at values must be strictly increasing",
		path: ["phases"],
	});

export type SyncPlanInstance = z.infer<typeof SyncPlanInstanceSchema>;
export type SyncPhase = z.infer<typeof SyncPhaseSchema>;
export type SyncParamsV1 = z.infer<typeof SyncParamsV1Schema>;
