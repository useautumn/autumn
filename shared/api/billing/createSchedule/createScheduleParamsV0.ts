import { FeatureQuantityParamsV0Schema } from "@api/billing/common/featureQuantity/featureQuantityParamsV0";
import { InvoiceModeParamsSchema } from "@api/billing/common/invoiceModeParams";
import { RedirectModeSchema } from "@api/billing/common/redirectMode";
import { z } from "zod/v4";
import { AttachDiscountSchema } from "../attachV2/attachDiscount";
import { BillingBehaviorSchema } from "../common/billingBehavior";
import { BillingCycleAnchorSchema } from "../common/billingCycleAnchor";
import {
	CustomizePlanV1BaseSchema,
	refineCustomizePlanV1Schema,
} from "../common/customizePlan/customizePlanV1";

export enum StartingAfterDuration {
	Month = "month",
	Year = "year",
}

// update_items is internal / not prod-ready — omit it from the schedule customize
// surface so the agent never uses it.
const CreateScheduleCustomizePlanSchema = refineCustomizePlanV1Schema(
	CustomizePlanV1BaseSchema.omit({
		free_trial: true,
		licenses: true,
		update_items: true,
	}).strict(),
	{
		includeFreeTrial: false,
		includeUpdateItems: false,
		includeLicenses: false,
	},
);

export const CreateSchedulePlanSchema = z.object({
	plan_id: z.string().meta({
		description: "The ID of the plan to schedule in this phase.",
	}),
	feature_quantities: z.array(FeatureQuantityParamsV0Schema).optional().meta({
		description: "Optional prepaid feature quantities for this phase's plan.",
	}),
	version: z.number().optional().meta({
		description: "Optional explicit plan version to schedule.",
	}),
	customize: CreateScheduleCustomizePlanSchema.optional().meta({
		description:
			"Customize the plan to schedule. Can override price, replace items, or patch items with add_items and remove_items.",
	}),
	subscription_id: z.string().optional().meta({
		description:
			"A unique ID to identify this subscription. Useful when scheduling the same plan multiple times.",
	}),
});

export const CreateScheduleStartingAfterSchema = z.object({
	duration_type: z.enum(StartingAfterDuration).meta({
		description: "The duration unit to offset this phase from the prior phase.",
	}),
	duration_count: z.number().int().positive().meta({
		description: "How many duration_type periods after the prior phase to start.",
	}),
});

export const CreateSchedulePhaseSchema = z
	.object({
		starts_at: z.union([z.number(), z.literal("now")]).optional().meta({
			description:
				"When this phase should start, in epoch milliseconds, or 'now' for the immediate phase.",
		}),
		starting_after: CreateScheduleStartingAfterSchema.optional().meta({
			description:
				"Relative start offset from the previous resolved schedule phase.",
		}),
		plans: z.array(CreateSchedulePlanSchema).min(1).meta({
			description: "Plans to materialize for this phase.",
		}),
	})
	.check((ctx) => {
		const hasStartsAt = ctx.value.starts_at !== undefined;
		const hasStartingAfter = ctx.value.starting_after !== undefined;

		if (hasStartsAt === hasStartingAfter) {
			ctx.issues.push({
				code: "custom",
				message:
					"Each phase must include exactly one of starts_at or starting_after",
				path: ["starts_at"],
				input: ctx.value,
			});
		}
	});

export const CreateScheduleParamsV0Schema = z
	.object({
		customer_id: z.string().meta({
			description: "The ID of the customer to create the schedule for.",
		}),
		entity_id: z.string().optional().meta({
			description: "Optional entity ID for an entity-scoped schedule.",
		}),
		invoice_mode: InvoiceModeParamsSchema.optional().meta({
			description:
				"Invoice mode creates and sends an invoice instead of charging the customer's payment method immediately for the first phase.",
		}),
		discounts: z.array(AttachDiscountSchema).optional().meta({
			description:
				"List of discounts to apply to the immediate phase. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code.",
		}),
		success_url: z.string().optional().meta({
			description: "URL to redirect to after successful checkout.",
		}),
		checkout_session_params: z.record(z.string(), z.unknown()).optional().meta({
			description:
				"Additional parameters to pass into the creation of the Stripe checkout session.",
		}),
		redirect_mode: RedirectModeSchema.default("if_required").meta({
			description:
				"Controls when to return a checkout URL for the immediate phase. 'always' forces a confirmation or checkout flow, 'if_required' only redirects when needed, and 'never' disables redirects.",
		}),
		billing_behavior: BillingBehaviorSchema.optional().meta({
			description:
				"Whether to prorate the immediate phase. 'none' skips proration charges and credits.",
		}),
		billing_cycle_anchor: BillingCycleAnchorSchema.optional().meta({
			description:
				"Pass 'now' to reset the billing cycle anchor of the immediate phase to the current time.",
		}),
		enable_plan_immediately: z.boolean().optional().meta({
			description:
				"If true, the immediate-phase cusProducts are activated immediately (and scheduled-phase cusProducts pre-inserted) even when payment is pending via Stripe checkout. The Autumn schedule rows are persisted on checkout.session.completed.",
		}),
		phases: z
			.tuple([CreateSchedulePhaseSchema])
			.rest(CreateSchedulePhaseSchema)
			.meta({
				description: "Ordered phase definitions for the schedule.",
			}),
	})
	.check((ctx) => {
		const hasRelativeTiming = ctx.value.phases.some(
			(phase) => phase.starts_at === "now" || phase.starting_after !== undefined,
		);

		for (let index = 0; index < ctx.value.phases.length; index++) {
			const phase = ctx.value.phases[index];
			if (!phase) continue;

			if (phase.starting_after !== undefined && index === 0) {
				ctx.issues.push({
					code: "custom",
					message: "starting_after cannot be used on the first phase",
					path: ["phases", index, "starting_after"],
					input: ctx.value,
				});
			}

			if (phase.starts_at === "now" && index !== 0) {
				ctx.issues.push({
					code: "custom",
					message: "starts_at: 'now' can only be used on the first phase",
					path: ["phases", index, "starts_at"],
					input: ctx.value,
				});
			}
		}

		if (hasRelativeTiming) return;

		const sortedPhases = [...ctx.value.phases].sort((a, b) => {
			if (typeof a.starts_at !== "number" || typeof b.starts_at !== "number") {
				return 0;
			}
			return a.starts_at - b.starts_at;
		});

		for (let index = 1; index < sortedPhases.length; index++) {
			const previousPhase = sortedPhases[index - 1];
			const currentPhase = sortedPhases[index];

			if (
				typeof previousPhase?.starts_at === "number" &&
				typeof currentPhase?.starts_at === "number" &&
				currentPhase.starts_at <= previousPhase.starts_at
			) {
				ctx.issues.push({
					code: "custom",
					message: "Phase starts_at values must be strictly increasing",
					path: ["phases"],
					input: ctx.value,
				});
				return;
			}
		}
	});

export type CreateScheduleParamsV0 = z.infer<
	typeof CreateScheduleParamsV0Schema
>;
export type CreateScheduleParamsV0Input = z.input<
	typeof CreateScheduleParamsV0Schema
>;
export type CreateSchedulePhaseV0 = CreateScheduleParamsV0["phases"][number];
export type ResolvedCreateSchedulePhaseV0 = Omit<
	CreateSchedulePhaseV0,
	"starts_at" | "starting_after"
> & {
	starts_at: number;
};
