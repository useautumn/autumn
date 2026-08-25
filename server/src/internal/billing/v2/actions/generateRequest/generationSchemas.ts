import {
	AttachParamsV1Schema,
	BillingBehaviorSchema,
	CreateSchedulePhaseSchema,
	CreateSchedulePlanSchema,
	CustomizePlanV1BaseSchema,
	createScheduleTimingIssues,
	ExtUpdateSubscriptionV1ParamsSchema,
	refineCustomizePlanV1Schema,
} from "@autumn/shared";
import { z } from "zod/v4";

/** Customize subset the dashboard sheets can seed — billing_controls,
 * update_items and remove_licenses have no sheet representation. */
const GenerationCustomizeSchema = refineCustomizePlanV1Schema(
	CustomizePlanV1BaseSchema.omit({
		billing_controls: true,
		remove_licenses: true,
		update_items: true,
	}).strict(),
	{ includeUpdateItems: false },
);

export const attachGenerationSchema = AttachParamsV1Schema.pick({
	plan_id: true,
	version: true,
	feature_quantities: true,
	plan_schedule: true,
	starts_at: true,
	ends_at: true,
	proration_behavior: true,
	enable_plan_immediately: true,
	discounts: true,
	currency: true,
	carry_over_balances: true,
	carry_over_usages: true,
	custom_line_items: true,
	license_quantities: true,
	new_billing_subscription: true,
	no_billing_changes: true,
	remove_plan_ids: true,
	billing_cycle_anchor: true,
})
	.extend({
		entity_id: z.string().nullable().optional().meta({
			description:
				"Entity to scope this attach to. Pass null or omit for a customer-level attach.",
		}),
		customize: GenerationCustomizeSchema.optional().meta({
			description:
				"Customize the plan being attached: base price override, item replacement or patches, free trial, or license links.",
		}),
		additional_plans: z.array(CreateSchedulePlanSchema).optional().meta({
			description:
				"Extra plans to attach alongside plan_id on the same invoice. Only set this when the request names more than one plan to attach together.",
		}),
	})
	.strict();

export const updateSubscriptionGenerationSchema =
	ExtUpdateSubscriptionV1ParamsSchema.omit({
		customer_data: true,
		customer_id: true,
		entity_data: true,
		entity_id: true,
		invoice_mode: true,
		processor_subscription_id: true,
		recalculate_balances: true,
		redirect_mode: true,
		status: true,
		subscription_id: true,
		transition_rules: true,
	})
		.extend({
			customize: GenerationCustomizeSchema.optional().meta({
				description:
					"Customize the current plan: base price override, item replacement or patches, free trial, or license links.",
			}),
		})
		.strict();

export const createScheduleGenerationSchema = z
	.strictObject({
		billing_behavior: BillingBehaviorSchema.optional().meta({
			description:
				"Whether to prorate the immediate phase. 'none' skips proration charges and credits.",
		}),
		billing_cycle_anchor: z.literal("now").optional().meta({
			description:
				"Pass 'now' to reset the billing cycle anchor of the immediate phase to the current time.",
		}),
		phases: z.array(CreateSchedulePhaseSchema).min(1).meta({
			description: "Ordered phase definitions for the schedule.",
		}),
		unscheduled_plans: z.array(CreateSchedulePlanSchema).optional().meta({
			description:
				"Plans billed with the immediate phase that the schedule never expires or replaces.",
		}),
	})
	.check((ctx) => {
		for (const issue of createScheduleTimingIssues(ctx.value.phases)) {
			ctx.issues.push({ code: "custom", input: ctx.value, ...issue });
		}
	});

export type AttachGenerationParams = z.infer<typeof attachGenerationSchema>;
export type UpdateSubscriptionGenerationParams = z.infer<
	typeof updateSubscriptionGenerationSchema
>;
export type CreateScheduleGenerationParams = z.infer<
	typeof createScheduleGenerationSchema
>;
export type GeneratedBillingParams =
	| AttachGenerationParams
	| UpdateSubscriptionGenerationParams
	| CreateScheduleGenerationParams;

export const GENERATE_BILLING_TOOLS = [
	"attach",
	"create_schedule",
	"update_subscription",
] as const;

export type GenerateBillingTool = (typeof GENERATE_BILLING_TOOLS)[number];

type GenerationRegistryEntry = {
	schema: z.ZodType;
	promptFragment: string;
};

export const generationRegistry: Record<
	GenerateBillingTool,
	GenerationRegistryEntry
> = {
	attach: {
		promptFragment:
			"This attaches a plan to the customer. When the request names several plans to attach together, set plan_id to the first and list the rest in additional_plans.",
		schema: attachGenerationSchema,
	},
	create_schedule: {
		promptFragment:
			"This creates a multi-phase plan schedule for the customer.",
		schema: createScheduleGenerationSchema,
	},
	update_subscription: {
		promptFragment: [
			"This updates the customer's existing subscription.",
			"cancel_action mapping: cancel now -> 'cancel_immediately'; cancel at the end of the billing period or cycle -> 'cancel_end_of_cycle'; undo a pending cancellation -> 'uncancel'.",
			"Only set plan_id when the customer has multiple plans and the request targets a specific one.",
		].join("\n"),
		schema: updateSubscriptionGenerationSchema,
	},
};

export const GenerateBillingRequestParamsSchema = z.object({
	current_request: z.record(z.string(), z.unknown()).optional().meta({
		description:
			"The request currently seeded in the sheet. When present, generation edits it instead of starting from scratch.",
	}),
	customer_id: z.string().min(1).meta({
		description: "The ID of the customer the generated request targets.",
	}),
	customer_product_id: z.string().optional().meta({
		description:
			"For update_subscription: the customer product the sheet is anchored to.",
	}),
	prompt: z.string().min(1).max(2000).meta({
		description: "Natural-language description of the billing change.",
	}),
	tool: z.enum(GENERATE_BILLING_TOOLS).meta({
		description: "Which billing operation to generate parameters for.",
	}),
});

export type GenerateBillingRequestParams = z.infer<
	typeof GenerateBillingRequestParamsSchema
>;
