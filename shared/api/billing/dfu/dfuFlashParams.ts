import { EntInterval } from "@models/productModels/intervals/entitlementInterval";
import { z } from "zod/v4";
import { ApiCustomerV5Schema } from "../../customers/apiCustomerV5";

/**
 * `POST /v1/billing.import` — image a customer INTO Autumn for live migration.
 * Read-only against processors. v1 fields are public; deferred capabilities
 * are schema-defined but `.meta({ internal: true })` so docs hide them.
 */

// RevenueCat processor `id` is the customer's `app_user_id`. (Vercel is not yet
// supported and is intentionally omitted so `type` renders as a clean enum.)
const ProcessorTypeSchema = z.enum(["stripe", "revenuecat"]);

const FlashCustomerDataSchema = z.object({
	name: z
		.string()
		.optional()
		.meta({ description: "Display name for the customer." }),
	email: z
		.string()
		.optional()
		.meta({ description: "Email address for the customer." }),
	fingerprint: z
		.string()
		.optional()
		.meta({ description: "Anti-fraud fingerprint for the customer." }),
});

const FlashProcessorIdentitySchema = z.object({
	type: ProcessorTypeSchema.meta({
		description: "The processor this identity belongs to.",
	}),
	id: z.string().meta({
		description:
			"The customer's id in that processor (Stripe customer id, or RevenueCat app_user_id).",
	}),
});

const FlashLinkSchema = z.object({
	subscription_id: z.string().optional().meta({
		description:
			"Existing processor subscription id this billable is adopted from.",
	}),
	schedule_id: z.string().optional().meta({
		description:
			"Existing processor subscription-schedule id this billable is adopted from.",
	}),
});

const FlashStartingAfterSchema = z
	.object({
		duration_type: z.enum(["month", "year"]),
		duration_count: z.number(),
	})
	.meta({ internal: true });

const FlashBalanceFilterSchema = z.object({
	// Intentionally the full EntInterval set: filters match against the line's own interval.
	interval: z.enum(EntInterval).nullable().optional().meta({
		description:
			"Reset interval selecting which entitlement line to target when a feature has several ('lifetime' or null = the non-resetting one-off line).",
	}),
	billing_behavior: z
		.enum(["included", "prepaid", "usage_based"])
		.optional()
		.meta({
			description:
				"Selects the included vs prepaid vs usage-based (pay-per-use) entitlement line when a feature has several.",
		}),
});

const FlashRolloverSchema = z
	.object({
		balance: z.number(),
		expires_at: z.number().optional(),
	})
	.meta({ internal: true });

const FlashBalanceSchema = z.object({
	feature_id: z
		.string()
		.meta({ description: "The feature whose balance is being set." }),
	filter: FlashBalanceFilterSchema.optional().meta({
		description:
			"Disambiguates which entitlement line to target when the feature has multiple.",
	}),
	usage: z.number().optional().meta({
		description:
			"Units already consumed; remaining balance is derived from the plan allowance minus this.",
	}),
	balance: z.number().optional().meta({
		description:
			"Explicit remaining balance override (mutually exclusive with usage).",
	}),
	next_reset_at: z
		.number()
		.optional()
		.meta({ description: "Unix ms timestamp of this line's next reset." }),
	rollover: FlashRolloverSchema.optional(),
});

const FlashFeatureQuantitySchema = z.object({
	feature_id: z
		.string()
		.meta({ description: "The prepaid feature being quantified." }),
	quantity: z
		.number()
		.meta({ description: "Purchased quantity for this prepaid feature." }),
});

const FlashPlanSchema = z.object({
	plan_id: z
		.string()
		.meta({ description: "The Autumn plan to attach to the customer." }),
	version: z.number().optional().meta({
		description: "Specific plan version to attach; defaults to the latest.",
	}),
	status: z
		.enum(["active", "trialing", "past_due", "canceled", "expired"])
		.optional()
		.meta({
			description:
				"Set the status of the plan to be flashed. Active if undefined.",
		}),
	started_at: z.number().optional().meta({
		description:
			"When the plan started (Unix ms). Defaults to the linked subscription's start, else the import time. Set this for one-off purchases to record the real purchase date.",
	}),
	quantity: z
		.number()
		.optional()
		.meta({ description: "Seat/unit quantity for the plan." }),
	feature_quantities: z
		.array(FlashFeatureQuantitySchema)
		.optional()
		.meta({ description: "Purchased prepaid quantities per feature." }),
	customize: z.record(z.string(), z.unknown()).optional().meta({
		internal: true,
	}),
	balances: z
		.array(FlashBalanceSchema)
		.optional()
		.meta({ description: "Per-feature balances to image onto the plan." }),
});

const FlashPhaseSchema = z.object({
	starts_at: z.union([z.number(), z.literal("now")]).optional(),
	starting_after: FlashStartingAfterSchema.optional(),
	plans: z.array(FlashPlanSchema),
});

const FlashBillableSchema = z
	.object({
		processor: ProcessorTypeSchema.optional().meta({
			description:
				"The processor that owns this billable (stripe or revenuecat). Omit for plans with no processor, e.g. a free plan.",
		}),
		link: FlashLinkSchema.optional().meta({
			description:
				"Existing processor billing object this billable is adopted from; omit for paid one-offs.",
		}),
		billing_cycle_anchor: z.number().optional().meta({
			description:
				"Unix ms billing anchor shared by co-billed plans on this billable.",
		}),
		// `plan` is the public single-plan path; `phases` is exclusive with it but
		// stays internal until multi-phase/scheduled imaging is fully implemented.
		plan: FlashPlanSchema.optional().meta({
			description:
				"The single plan on this billable (provide either plan or phases, not both).",
		}),
		phases: z.array(FlashPhaseSchema).optional().meta({ internal: true }),
	})
	.superRefine((billable, ctx) => {
		const hasPlan = billable.plan !== undefined;
		const hasPhases = billable.phases !== undefined;
		if (hasPlan && hasPhases) {
			ctx.addIssue({
				code: "custom",
				message: "Provide either `plan` or `phases`, not both",
				path: ["plan"],
			});
		} else if (!(hasPlan || hasPhases)) {
			ctx.addIssue({
				code: "custom",
				message: "A billable must have a `plan` or `phases`",
				path: ["plan"],
			});
		}
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
	customer_data: FlashCustomerDataSchema.optional().meta({
		description:
			"Optional identity fields upserted onto the customer (applied to existing customers too).",
	}),
	processors: z.array(FlashProcessorIdentitySchema).optional().meta({
		description:
			"The customer's processor identities (e.g. Stripe customer id, RevenueCat app_user_id). Omit for customers with no processor, e.g. those only ever on a free plan.",
	}),
	billables: z.array(FlashBillableSchema).meta({
		description:
			"The billing objects (subscriptions, one-offs) to image, each carrying its plan.",
	}),
	entities: z.array(FlashEntitySchema).optional().meta({
		internal: true,
	}),
	dry_run: z.boolean().optional().meta({
		description:
			"If true, validate and compute without persisting; returns what would be flashed.",
	}),
});

export const DfuFlashedPlanSchema = z.object({
	plan_id: z.string().meta({ description: "The plan that was imaged." }),
	processor: z
		.string()
		.meta({ description: "The processor that owns the imaged plan." }),
	customer_product_id: z.string().nullable().meta({
		description: "The created (or existing) customer product id, if any.",
	}),
	status: z
		.string()
		.meta({ description: "The resulting status of the imaged plan." }),
	skipped: z.boolean().meta({
		description:
			"True if an active plan already existed and this one was left untouched.",
	}),
	expired: z.boolean().optional().meta({
		description:
			"True if this was an existing active plan expired because it was absent from the imaged desired state.",
	}),
	mismatch: z.boolean().optional().meta({
		description:
			"True when the imaged state may be wrong — e.g. a resetting plan with no resolvable billing anchor, or a paid recurring plan with no linked subscription for Autumn to manage. The plan is still imaged; see `reason` and fix by supplying started_at or a subscription_id.",
	}),
	reason: z.string().optional().meta({
		description:
			"Why the plan was skipped, expired, or flagged as a mismatch, when applicable.",
	}),
});

export const DfuFlashResultSchema = z.object({
	customer_id: z.string().meta({ description: "The imaged customer's id." }),
	flashed: z
		.array(DfuFlashedPlanSchema)
		.meta({ description: "Per-plan outcome of the flash." }),
	// Freshly-read imaged customer; null for dry_run since nothing is persisted.
	customer: ApiCustomerV5Schema.nullable().meta({
		description: "The freshly-read imaged customer; null for dry_run.",
	}),
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
