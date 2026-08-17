import { z } from "zod/v4";

export const EVENTS_AGGREGATE_EXAMPLE_V1_FLAT = {
	list: [
		{
			period: 1762905600000,
			values: {
				messages: 10,
				sessions: 3,
			},
		},
		{
			period: 1762992000000,
			values: {
				messages: 3,
				sessions: 12,
			},
		},
	],
	total: {
		messages: {
			count: 2,
			sum: 13,
		},
		sessions: {
			count: 2,
			sum: 15,
		},
	},
};

export const EVENTS_AGGREGATE_EXAMPLE_V1_GROUPED = {
	list: [
		{
			period: 1762905600000,
			values: {
				messages: 10,
				sessions: 3,
			},
			grouped_values: {
				messages: { api: 5, web: 5 },
				sessions: { api: 2, web: 1 },
			},
		},
		{
			period: 1762992000000,
			values: {
				messages: 3,
				sessions: 12,
			},
			grouped_values: {
				messages: { api: 1, web: 2 },
				sessions: { api: 10, web: 2 },
			},
		},
	],
	total: {
		messages: {
			count: 2,
			sum: 13,
		},
		sessions: {
			count: 2,
			sum: 15,
		},
	},
};

const EventAggregateListItemV1Schema = z.object({
	period: z.number().meta({
		description: "Unix timestamp (epoch ms) for this time period",
	}),
	values: z.record(z.string(), z.number()).meta({
		description: "Aggregated values per feature: { [featureId]: number }",
	}),
	grouped_values: z
		.record(z.string(), z.record(z.string(), z.number()))
		.optional()
		.meta({
			description:
				"Values broken down by group (only present when group_by is used): { [featureId]: { [groupValue]: number } }",
		}),
});

const EventAggregateTotalItemSchema = z.object({
	count: z.number().meta({ description: "Number of events for this feature" }),
	sum: z.number().meta({ description: "Sum of event values for this feature" }),
});

/**
 * One balance that a tracked feature drew from. `entity_id` is null for a
 * customer-level balance shared across every entity.
 */
const DeductionBalanceSchema = z.object({
	balance_id: z.string().meta({
		description:
			"ID of the balance row drawn from (customer_entitlement or rollover).",
	}),
	entity_id: z.string().nullable().meta({
		description:
			"Entity that owns this balance, or null when it is customer-level and shared.",
	}),
	plan_id: z.string().nullable().meta({
		description:
			"Plan the balance came with. Null for balances created outside a plan.",
	}),
	reset: z
		.object({
			interval: z.string(),
			resets_at: z.number().nullable(),
		})
		.nullable()
		.meta({ description: "Reset config for this balance, captured at deduction time." }),
	credit_cost: z.number().nullable().meta({
		description:
			"Multiplier applied converting the tracked feature into this balance. Null when 1:1, or when the query spans sources converting at different rates.",
	}),
	deducted: z.number(),
	events: z.number(),
});

/** Everything one feature's balances absorbed in this period. */
const DeductionFeatureSchema = z.object({
	feature_type: z.enum(["metered", "credit_system"]).meta({
		description:
			"credit_system means `deducted` is credits; metered means it is that feature's own amount.",
	}),
	deducted: z.number(),
	events: z.number(),
	balances: z.array(DeductionBalanceSchema),
});

const DeductionPeriodSchema = z.object({
	period: z.number().meta({
		description: "Unix timestamp (epoch ms), same basis as `list`.",
	}),
	values: z.record(z.string(), DeductionFeatureSchema).meta({
		description:
			"Keyed by the feature that OWNS the balance drawn from, not the feature that was tracked.",
	}),
	grouped_values: z
		.record(z.string(), z.record(z.string(), z.object({
			deducted: z.number(),
			credit_cost: z.number().nullable().optional(),
		})))
		.optional()
		.meta({
			description:
				"Present only when group_by is used. Keyed by balance_id, then by group value — the only way to attribute a shared balance to the entity that spent from it.",
		}),
});

export const EventsAggregateResponseV1Schema = z.object({
	list: z.array(EventAggregateListItemV1Schema).meta({
		description: "Array of time periods with aggregated values",
	}),
	total: z.record(z.string(), EventAggregateTotalItemSchema).meta({
		description:
			"Total aggregations per feature. Keys are feature IDs, values contain count and sum.",
	}),
	deductions: z.array(DeductionPeriodSchema).optional().meta({
		description:
			'Per-balance breakdown of what was consumed. Present only when aggregate_on is "deducted".',
	}),
});

export type DeductionBalance = z.infer<typeof DeductionBalanceSchema>;
export type DeductionFeature = z.infer<typeof DeductionFeatureSchema>;
export type DeductionPeriod = z.infer<typeof DeductionPeriodSchema>;

export type EventsAggregateResponseV1 = z.infer<
	typeof EventsAggregateResponseV1Schema
>;

export type EventAggregateListItemV1 = z.infer<
	typeof EventAggregateListItemV1Schema
>;
