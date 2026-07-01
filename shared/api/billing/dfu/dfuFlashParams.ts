import { z } from "zod/v4";

/**
 * `POST /v1/dfu.flash` — image a customer INTO Autumn for live migration.
 * Read-only against processors. v1 fields are public; deferred capabilities
 * are schema-defined but `.meta({ internal: true })` so docs hide them.
 */

const ProcessorTypeSchema = z.union([
	z.literal("stripe"),
	z.literal("vercel").meta({ internal: true }),
]);

const BillableProcessorSchema = z.union([
	z.literal("stripe"),
	z.literal("revenuecat"),
	z.literal("vercel").meta({ internal: true }),
	z.literal("none"),
]);

const FlashCustomerDataSchema = z.object({
	name: z.string().optional(),
	email: z.string().optional(),
	fingerprint: z.string().optional(),
});

const FlashProcessorIdentitySchema = z.object({
	type: ProcessorTypeSchema,
	id: z.string(),
});

const FlashLinkSchema = z.object({
	subscription_id: z.string().optional(),
	schedule_id: z.string().optional(),
});

const FlashStartingAfterSchema = z
	.object({
		duration_type: z.enum(["month", "year"]),
		duration_count: z.number(),
	})
	.meta({ internal: true });

const FlashBalanceFilterSchema = z.object({
	interval: z
		.enum(["hour", "day", "week", "month", "year"])
		.nullable()
		.optional(),
	billing_behavior: z.enum(["included", "prepaid"]).optional(),
});

const FlashRolloverSchema = z
	.object({
		balance: z.number(),
		expires_at: z.number().optional(),
	})
	.meta({ internal: true });

const FlashBalanceSchema = z.object({
	feature_id: z.string(),
	filter: FlashBalanceFilterSchema.optional(),
	usage: z.number().optional(),
	balance: z.number().optional(),
	next_reset_at: z.number().optional(),
	rollover: FlashRolloverSchema.optional(),
});

const FlashFeatureQuantitySchema = z.object({
	feature_id: z.string(),
	quantity: z.number(),
});

const FlashPlanSchema = z.object({
	plan_id: z.string(),
	version: z.number().optional(),
	status: z
		.enum(["active", "trialing", "past_due", "canceled", "expired"])
		.optional()
		.meta({
			description:
				"Set the status of the plan to be flashed. Active if undefined.",
		}),
	quantity: z.number().optional(),
	feature_quantities: z.array(FlashFeatureQuantitySchema).optional(),
	customize: z.record(z.string(), z.unknown()).optional().meta({
		internal: true,
	}),
	balances: z.array(FlashBalanceSchema).optional(),
});

const FlashPhaseSchema = z.object({
	starts_at: z.union([z.number(), z.literal("now")]).optional(),
	starting_after: FlashStartingAfterSchema.optional(),
	plans: z.array(FlashPlanSchema),
});

const FlashBillableSchema = z.object({
	processor: BillableProcessorSchema,
	link: FlashLinkSchema.optional(),
	billing_cycle_anchor: z.number().optional(),
	phases: z.array(FlashPhaseSchema),
});

const FlashEntitySchema = z.object({
	entity_id: z.string(),
	feature_id: z.string().optional(),
	billables: z.array(FlashBillableSchema),
});

export const DfuFlashParamsSchema = z.object({
	customer_id: z.string().meta({
		description: "Autumn customer to image into.",
	}),
	customer_data: FlashCustomerDataSchema.optional(),
	processors: z.array(FlashProcessorIdentitySchema),
	billables: z.array(FlashBillableSchema),
	entities: z.array(FlashEntitySchema).optional().meta({
		internal: true,
	}),
	dry_run: z.boolean().optional(),
});

export const DfuFlashedPlanSchema = z.object({
	plan_id: z.string(),
	processor: z.string(),
	customer_product_id: z.string().nullable(),
	status: z.string(),
	skipped: z.boolean(),
	reason: z.string().optional(),
});

export const DfuFlashResultSchema = z.object({
	customer_id: z.string(),
	flashed: z.array(DfuFlashedPlanSchema),
});

export type FlashCustomerData = z.infer<typeof FlashCustomerDataSchema>;
export type FlashBalance = z.infer<typeof FlashBalanceSchema>;
export type FlashPlan = z.infer<typeof FlashPlanSchema>;
export type FlashPhase = z.infer<typeof FlashPhaseSchema>;
export type FlashBillable = z.infer<typeof FlashBillableSchema>;
export type FlashEntity = z.infer<typeof FlashEntitySchema>;
export type DfuFlashParams = z.infer<typeof DfuFlashParamsSchema>;
export type DfuFlashedPlan = z.infer<typeof DfuFlashedPlanSchema>;
export type DfuFlashResult = z.infer<typeof DfuFlashResultSchema>;
