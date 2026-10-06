import { FeatureQuantityParamsV0Schema } from "@api/billing/common/featureQuantity/featureQuantityParamsV0";
import { InvoiceModeParamsSchema } from "@api/billing/common/invoiceModeParams";
import { LicenseQuantityParamsSchema } from "@api/billing/common/licenseQuantityParams";
import { RedirectModeSchema } from "@api/billing/common/redirectMode";
import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1";
import { CurrencyCodeSchema } from "@api/products/components/additionalCurrencies";
import { z } from "zod/v4";
import { AttachDiscountSchema } from "../attachV2/attachDiscount";
import { BillingBehaviorSchema } from "../common/billingBehavior";
import { ImmediateBillingCycleAnchorSchema } from "../common/billingCycleAnchor";
import {
	CustomizePlanV1BaseSchema,
	refineCustomizePlanV1Schema,
} from "../common/customizePlan/customizePlanV1";
import { UnixMsTimestampSchema } from "../common/unixMsTimestamp";

export enum StartingAfterDuration {
	Month = "month",
	Year = "year",
}

// update_items is internal / not prod-ready — omit it from the schedule customize
// surface so the agent never uses it.
const CreateScheduleCustomizePlanSchema = refineCustomizePlanV1Schema(
	CustomizePlanV1BaseSchema.omit({
		free_trial: true,
		update_items: true,
	}).strict(),
	{
		includeFreeTrial: false,
		includeUpdateItems: false,
	},
);

export const PhaseBillingCycleAnchorSchema = z.union([
	z.literal("phase_start"),
	UnixMsTimestampSchema,
]);

export const CreateSchedulePlanSchema = z.object({
	plan_id: z.string().meta({
		description: "The ID of the plan to schedule in this phase.",
	}),
	entity_id: z.string().nullable().optional().meta({
		description:
			"The plan scope. Omit to inherit the request entity, pass null for customer-level, or pass an entity ID. On phases after the first, the entity must already be scoped by the first phase — a schedule cannot change scope mid-flight.",
	}),
	feature_quantities: z.array(FeatureQuantityParamsV0Schema).optional().meta({
		description: "Optional prepaid feature quantities for this phase's plan.",
	}),
	license_quantities: z.array(LicenseQuantityParamsSchema).optional().meta({
		description:
			"Seat quantities for this phase's licenses, keyed by license plan. Omitted on a later phase, the phase grants only the included seats.",
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
		description:
			"How many duration_type periods after the prior phase to start.",
	}),
});

export const CreateSchedulePhaseSchema = z
	.object({
		starts_at: z
			.union([z.number(), z.literal("now")])
			.optional()
			.meta({
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
		billing_cycle_anchor: PhaseBillingCycleAnchorSchema.optional().meta({
			description:
				"Pass 'phase_start' to reset the billing cycle when this phase starts. On the first phase, a future timestamp in epoch milliseconds anchors the cycle on that date instead.",
		}),
		proration_behavior: BillingBehaviorSchema.optional().meta({
			description:
				"How the change when this phase starts is billed. 'prorate_immediately' charges or credits the prorated difference, 'none' skips it. The first phase also takes 'bill_difference', which charges or credits the full-period price difference.",
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

export const createScheduleTimingIssues = (
	phases: readonly {
		starts_at?: number | "now";
		starting_after?: unknown;
	}[],
): { message: string; path: (string | number)[] }[] => {
	const issues: { message: string; path: (string | number)[] }[] = [];
	const hasRelativeTiming = phases.some(
		(phase) => phase.starts_at === "now" || phase.starting_after !== undefined,
	);

	for (let index = 0; index < phases.length; index++) {
		const phase = phases[index];
		if (!phase) continue;

		if (phase.starting_after !== undefined && index === 0) {
			issues.push({
				message: "starting_after cannot be used on the first phase",
				path: ["phases", index, "starting_after"],
			});
		}

		if (phase.starts_at === "now" && index !== 0) {
			issues.push({
				message: "starts_at: 'now' can only be used on the first phase",
				path: ["phases", index, "starts_at"],
			});
		}
	}

	if (hasRelativeTiming) return issues;

	const sortedPhases = [...phases].sort((a, b) => {
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
			issues.push({
				message: "Phase starts_at values must be strictly increasing",
				path: ["phases"],
			});
			return issues;
		}
	}

	return issues;
};

/** Later phases bill their start through Stripe, which neither charges a full difference nor anchors on a date. */
export const schedulePhaseBillingIssues = ({
	phases,
	immediatePhaseFieldsOnRequest = false,
}: {
	phases: readonly {
		proration_behavior?: string;
		billing_cycle_anchor?: string | number;
	}[];
	immediatePhaseFieldsOnRequest?: boolean;
}): { message: string; path: (string | number)[] }[] =>
	phases.flatMap((phase, index) => {
		const issues: { message: string; path: (string | number)[] }[] = [];
		const isFirstPhase = index === 0;
		if (isFirstPhase && immediatePhaseFieldsOnRequest) {
			if (phase.proration_behavior !== undefined) {
				issues.push({
					message:
						"proration_behavior cannot be set on the first phase. Use the top-level billing_behavior instead.",
					path: ["phases", index, "proration_behavior"],
				});
			}
			if (typeof phase.billing_cycle_anchor === "number") {
				issues.push({
					message:
						"A timestamp billing_cycle_anchor cannot be set on the first phase. Use the top-level billing_cycle_anchor instead.",
					path: ["phases", index, "billing_cycle_anchor"],
				});
			}
			return issues;
		}
		if (isFirstPhase) return issues;
		if (phase.proration_behavior === "bill_difference") {
			issues.push({
				message:
					"'bill_difference' is only supported on the first phase. A later phase's proration_behavior must be 'prorate_immediately' or 'none'.",
				path: ["phases", index, "proration_behavior"],
			});
		}
		if (typeof phase.billing_cycle_anchor === "number") {
			issues.push({
				message:
					"A timestamp billing_cycle_anchor is only supported on the first phase. Later phases take 'phase_start'.",
				path: ["phases", index, "billing_cycle_anchor"],
			});
		}
		return issues;
	});

export const CreateScheduleParamsV0BaseSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer to create the schedule for.",
	}),
	entity_id: z.string().optional().meta({
		description: "Optional entity ID for an entity-scoped schedule.",
	}),
	free_trial: FreeTrialParamsV1Schema.nullable().optional().meta({
		description:
			"Free trial configuration applied to every plan in the immediate phase.",
	}),
	currency: CurrencyCodeSchema.length(3).optional().meta({
		description:
			"Three-letter Stripe-supported currency code used to bill the immediate phase (for example, 'usd').",
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
			"Whether to prorate the immediate phase. 'none' skips proration charges and credits, 'bill_difference' charges/credits the full-period price difference.",
	}),
	no_billing_changes: z.boolean().optional().meta({
		description: "If true, skips any billing changes for the schedule.",
	}),
	billing_cycle_anchor: ImmediateBillingCycleAnchorSchema.optional().meta({
		description:
			"Pass 'now' to reset the billing cycle anchor of the immediate phase to the current time.",
	}),
	enable_plan_immediately: z.boolean().optional().meta({
		description:
			"If true, the immediate-phase cusProducts are activated immediately (and scheduled-phase cusProducts pre-inserted) even when payment is pending via Stripe checkout. The Autumn schedule rows are persisted on checkout.session.completed.",
	}),
	preserve_add_ons: z.boolean().optional().meta({
		description:
			"Deprecated and ignored. Active plans the schedule does not list keep running until a listed plan in their group replaces them or the schedule ends.",
	}),
	unscheduled_plans: z.array(CreateSchedulePlanSchema).optional().meta({
		description:
			"Plans billed with the immediate phase that the schedule never expires or replaces. No phase may declare a plan in the same group and scope.",
	}),
	phases: z
		.tuple([CreateSchedulePhaseSchema])
		.rest(CreateSchedulePhaseSchema)
		.meta({
			description: "Ordered phase definitions for the schedule.",
		}),
});

export const CreateScheduleParamsV0Schema =
	CreateScheduleParamsV0BaseSchema.check((ctx) => {
		const issues = [
			...createScheduleTimingIssues(ctx.value.phases),
			...schedulePhaseBillingIssues({
				phases: ctx.value.phases,
				immediatePhaseFieldsOnRequest: true,
			}),
		];
		for (const issue of issues) {
			ctx.issues.push({ code: "custom", input: ctx.value, ...issue });
		}
	});

export type CreateScheduleParamsV0 = z.infer<
	typeof CreateScheduleParamsV0Schema
>;
export type CreateScheduleParamsV0Input = z.input<
	typeof CreateScheduleParamsV0Schema
>;
export type CreateSchedulePhaseV0 = CreateScheduleParamsV0["phases"][number];
export type CreateSchedulePlanV0 = CreateSchedulePhaseV0["plans"][number];
export type ResolvedCreateSchedulePhaseV0 = Omit<
	CreateSchedulePhaseV0,
	"starts_at" | "starting_after"
> & {
	starts_at: number;
};
