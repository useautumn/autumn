import { AttachDiscountSchema } from "@api/billing/attachV2/attachDiscount.js";
import { PreviewInvoiceCreditsSchema } from "@api/billing/common/billingPreviewResponse.js";
import { CustomLineItemSchema } from "@api/billing/common/customLineItem.js";
import { UnixMsTimestampSchema } from "@api/billing/common/unixMsTimestamp.js";
import { ApiFeatureOverrideSchema } from "@api/features/apiFeatureOverride.js";
import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice.js";
import { BillingMethod } from "@api/products/components/billingMethod.js";
import { InvoicePaymentMethodSchema } from "@models/orgModels/orgConfig.js";
import { ApiPriceProcessorsSchema } from "@api/products/components/processors.js";
import {
	PlanItemPriceParamsSchema,
	planItemParamsIssues,
} from "@api/products/items/crud/createPlanItemParamsV1.js";
import { z } from "zod/v4";
import { ApiListInvoiceV1Schema } from "./apiListInvoiceV1.js";

const LinePeriodShape = {
	period_start: UnixMsTimestampSchema.optional().meta({
		description:
			"Start of the period this line covers, in milliseconds. Defaults to the parent's period, then the invoice's period_start / period_end when sent.",
	}),
	period_end: UnixMsTimestampSchema.optional().meta({
		description:
			"End of the period this line covers, in milliseconds. Given together with period_start.",
	}),
};

const linePeriodIssue = ({
	period_start,
	period_end,
}: {
	period_start?: number;
	period_end?: number;
}) => {
	if ((period_start === undefined) !== (period_end === undefined)) {
		return "period_start and period_end must be provided together.";
	}
	if (
		period_start !== undefined &&
		period_end !== undefined &&
		period_end <= period_start
	) {
		return "period_end must be after period_start.";
	}
	return undefined;
};

const duplicateFeatureQuantity = (
	entries: { feature_id: string; billing_behavior: string }[] = [],
) => {
	const keys = entries.map(
		(entry) => `${entry.feature_id} (${entry.billing_behavior})`,
	);
	return keys.find((key, index) => keys.indexOf(key) !== index);
};

/** Adds a line's period and duplicate-feature issues to a zod check. */
const pushLineIssues = ({
	ctx,
	featureQuantities,
}: {
	ctx: z.core.ParsePayload<{ period_start?: number; period_end?: number }>;
	featureQuantities?: { feature_id: string; billing_behavior: string }[];
}) => {
	const periodIssue = linePeriodIssue(ctx.value);
	if (periodIssue) {
		ctx.issues.push({ code: "custom", message: periodIssue, input: ctx.value });
	}
	const duplicate = duplicateFeatureQuantity(featureQuantities);
	if (duplicate) {
		ctx.issues.push({
			code: "custom",
			message: `feature_quantities lists ${duplicate} more than once.`,
			input: ctx.value,
		});
	}
};

/** Pricing-only subset of the catalog base price. */
export const InvoiceBasePriceParamsSchema = BasePriceParamsSchema.pick({
	amount: true,
	interval: true,
	interval_count: true,
})
	.extend({
		processors: ApiPriceProcessorsSchema.optional().meta({
			description:
				"Bill this line under an existing Stripe price instead of an inline one.",
		}),
	})
	.strict();

/** Pricing-only subset of a catalog plan item's price. */
export const InvoiceItemPriceParamsSchema = PlanItemPriceParamsSchema.pick({
	amount: true,
	tiers: true,
	tier_behavior: true,
	interval: true,
	interval_count: true,
	billing_units: true,
	billing_method: true,
})
	.extend({
		processors: ApiPriceProcessorsSchema.optional().meta({
			description:
				"Bill this line under an existing Stripe price instead of an inline one.",
		}),
	})
	.strict();

export const InvoiceCustomizeItemSchema = z
	.object({
		feature_id: z.string().meta({
			description: "The feature whose pricing is overridden on this invoice.",
		}),
		price: InvoiceItemPriceParamsSchema.optional().meta({
			description: "Pricing to use for this feature on this invoice.",
		}),
		feature_override: ApiFeatureOverrideSchema.pick({
			credit_schema: true,
		})
			.strict()
			.optional()
			.meta({
				description:
					"For credit-system features: a credit rate card to use when converting `usage` on this invoice.",
			}),
	})
	.strict()
	.check((ctx) => {
		const { feature_id, price } = ctx.value;
		if (!price) return;
		const issues = planItemParamsIssues({ feature_id, price });
		// The catalog allows negative prices; an invoice credit is a negative custom line item.
		const isNegative =
			(price.amount ?? 0) < 0 ||
			(price.tiers ?? []).some(
				(tier) =>
					tier.amount < 0 ||
					(tier.additional_currencies ?? []).some(
						(entry) => (entry.amount ?? 0) < 0 || (entry.flat_amount ?? 0) < 0,
					),
			);
		if (isNegative) {
			issues.push({
				message:
					"customize.items prices cannot be negative. Use a negative custom_line_items entry for a credit.",
				input: price,
			});
		}
		for (const { message, input } of issues) {
			ctx.issues.push({ code: "custom", message, input, path: ["price"] });
		}
	});

const InvoiceCustomizeItemsSchema = z
	.array(InvoiceCustomizeItemSchema)
	.check((ctx) => {
		const featureIds = ctx.value.map((item) => item.feature_id);
		const duplicate = featureIds.find(
			(featureId, index) => featureIds.indexOf(featureId) !== index,
		);
		if (duplicate) {
			ctx.issues.push({
				code: "custom",
				message: `customize.items lists feature ${duplicate} more than once.`,
				input: ctx.value,
			});
		}
	});

export const InvoiceCustomizeSchema = z
	.object({
		price: InvoiceBasePriceParamsSchema.nullable().optional().meta({
			description:
				"Override the plan's base price for this invoice. Pass null or an amount of 0 to omit the base price line.",
		}),
		items: InvoiceCustomizeItemsSchema.optional().meta({
			description:
				"Override feature pricing for this invoice. Only pricing fields are accepted; grants, resets and rollovers are not part of an invoice.",
		}),
	})
	.strict()
	.meta({
		title: "InvoiceCustomize",
		description:
			"Pricing overrides applied to this invoice only. The catalog and the customer's plan are not changed.",
	});

export const InvoiceUsageEntrySchema = z
	.object({
		feature_id: z.string().meta({
			description: "The metered feature whose units are being converted.",
		}),
		quantity: z.number().nonnegative().meta({
			description:
				"Billable units of the metered feature. Converted to the credit-system feature through its rate card.",
		}),
		properties: z.record(z.string(), z.unknown()).optional().meta({
			description:
				"Event properties used to pick the rate card dimension and multipliers.",
		}),
	})
	.strict();

export const InvoiceFeatureQuantitySchema = z
	.object({
		feature_id: z.string().meta({
			description: "The feature to bill.",
		}),
		billing_behavior: z.enum(BillingMethod).meta({
			description:
				"Which of the feature's prices to use: 'prepaid' or 'usage_based'.",
		}),
		quantity: z.number().nonnegative().optional().meta({
			description:
				"Billable feature units in total, exclusive of any included usage. Not per seat or per entity. For a credit-system feature this is the number of credits.",
		}),
		usage: z.array(InvoiceUsageEntrySchema).optional().meta({
			description:
				"For credit-system features: billable units of the source features, converted through the credit rate card. Mutually exclusive with quantity.",
		}),
		prorate: z.boolean().optional().meta({
			description:
				"Whether to prorate this line against its period. Defaults to true for prepaid and false for usage-based.",
		}),
		...LinePeriodShape,
	})
	.strict()
	.refine(
		(entry) => (entry.quantity !== undefined) !== (entry.usage !== undefined),
		{ message: "Provide exactly one of quantity or usage." },
	)
	.check((ctx) => pushLineIssues({ ctx }));

export const InvoiceLicenseQuantitySchema = z
	.object({
		license_plan_id: z.string().meta({
			description: "The license plan linked to the parent plan.",
		}),
		quantity: z.number().int().nonnegative().meta({
			description: "Billable seats, exclusive of any included seats.",
		}),
		customize: z
			.object({
				price: InvoiceBasePriceParamsSchema.nullable().optional().meta({
					description: "Override the license's per-seat price on this invoice.",
				}),
				items: InvoiceCustomizeItemsSchema.optional().meta({
					description:
						"Override the license plan's feature pricing for this license's feature_quantities on this invoice. The parent plan's customize.items never apply to license features.",
				}),
			})
			.strict()
			.optional()
			.meta({
				description:
					"Pricing overrides for this license on this invoice only. The catalog and the customer's plan are not changed.",
			}),
		feature_quantities: z.array(InvoiceFeatureQuantitySchema).optional().meta({
			description: "Feature charges priced through the license plan.",
		}),
		prorate: z.boolean().optional().meta({
			description:
				"Whether to prorate seat charges against the license's period. Defaults to true.",
		}),
		...LinePeriodShape,
	})
	.strict()
	.check((ctx) =>
		pushLineIssues({
			ctx,
			featureQuantities: ctx.value.feature_quantities,
		}),
	);

export const InvoicePlanParamsSchema = z
	.object({
		plan_id: z.string().meta({
			description: "The catalog plan (or variant) whose pricing to use.",
		}),
		version: z.number().optional().meta({
			description: "Plan version. Defaults to the active version.",
		}),
		entity_id: z.string().min(1).nullable().optional().meta({
			description:
				"The entity this plan's lines are billed to. Omit to inherit the request's entity_id, or pass null for customer-level.",
		}),
		customize: InvoiceCustomizeSchema.optional(),
		feature_quantities: z.array(InvoiceFeatureQuantitySchema).optional(),
		license_quantities: z.array(InvoiceLicenseQuantitySchema).optional(),
		discounts: z.array(AttachDiscountSchema).optional().meta({
			description: "Discounts applied only to this plan's lines.",
		}),
		prorate: z.boolean().optional().meta({
			description:
				"Whether to prorate the base price against the plan's period. Defaults to true.",
		}),
		...LinePeriodShape,
	})
	.strict()
	.check((ctx) =>
		pushLineIssues({
			ctx,
			featureQuantities: ctx.value.feature_quantities,
		}),
	);

export const InvoiceCustomLineItemSchema = CustomLineItemSchema.extend({
	period_start: LinePeriodShape.period_start.meta({
		description:
			"Start of the period this charge covers, in milliseconds. Printed on the line only; a custom line never inherits the invoice's period.",
	}),
	period_end: LinePeriodShape.period_end.meta({
		description:
			"End of the period this charge covers, in milliseconds. Given together with period_start.",
	}),
}).check((ctx) => pushLineIssues({ ctx }));

/** How far a new invoice advances: left editable, opened silently, or opened and sent. */
export const InvoiceIssueMethodSchema = z.enum(["draft", "finalize", "send"]);

const ISSUE_METHOD_DESCRIPTION =
	"draft leaves the invoice editable. finalize opens it without Stripe emailing, reminding or charging (auto_advance off). send opens it with auto_advance on. Defaults to send.";

export const CreateInvoiceParamsSchema = z
	.object({
		customer_id: z.string().meta({
			description: "The customer to invoice.",
		}),
		entity_id: z.string().min(1).optional().meta({
			description:
				"The entity every plan is billed to unless the plan sets its own entity_id. The invoice is tagged with it when every plan line resolves to this entity.",
		}),
		plans: z.array(InvoicePlanParamsSchema).optional(),
		custom_line_items: z.array(InvoiceCustomLineItemSchema).optional().meta({
			description: "Charges that are not tied to any plan or feature.",
		}),
		discounts: z.array(AttachDiscountSchema).optional().meta({
			description: "Discounts applied to the whole invoice.",
		}),
		invoice_template_id: z.string().optional().meta({
			description:
				"ID of an invoice template whose footer, memo and default payment terms are applied.",
		}),
		net_terms_days: z.number().int().positive().optional().meta({
			description:
				"Days until the invoice is due. Defaults to the template's terms, then the org default. Cannot be combined with due_date.",
		}),
		issue_date: UnixMsTimestampSchema.optional().meta({
			description:
				"Date of issue printed on the invoice, in milliseconds. Defaults to now; cannot be in the future.",
		}),
		due_date: UnixMsTimestampSchema.optional().meta({
			description:
				"When payment is due, in milliseconds. Must be in the future. Cannot be combined with net_terms_days.",
		}),
		tax_rate_id: z.string().optional().meta({
			description: "Stripe tax rate ID (txr_...) applied to every line.",
		}),
		payment_method_types: z
			.array(InvoicePaymentMethodSchema)
			.min(1)
			.optional()
			.meta({
				description:
					"Payment method types the customer can pay the invoice with, e.g. card and us_bank_account. Defaults to the org's allowed payment methods.",
			}),
		period_start: UnixMsTimestampSchema.optional().meta({
			description:
				"Start of the period being invoiced, in milliseconds. Plan, feature and license lines without their own period use this one, and every line period must fall inside it. If omitted, lines without their own period carry none and are not prorated.",
		}),
		period_end: UnixMsTimestampSchema.optional().meta({
			description:
				"End of the period being invoiced, in milliseconds. Given together with period_start.",
		}),
		preview: z.boolean().optional().meta({
			description:
				"If true, returns the calculated lines and totals without creating an invoice.",
		}),
		issue_method: InvoiceIssueMethodSchema.optional().meta({
			description: ISSUE_METHOD_DESCRIPTION,
		}),
	})
	.strict()
	.refine(
		(params) =>
			(params.period_start === undefined) === (params.period_end === undefined),
		{ message: "period_start and period_end must be provided together." },
	)
	.refine(
		(params) =>
			params.period_start === undefined ||
			params.period_end === undefined ||
			params.period_end > params.period_start,
		{ message: "period_end must be after period_start." },
	)
	.refine(
		(params) =>
			params.issue_date === undefined ||
			params.due_date === undefined ||
			params.due_date > params.issue_date,
		{ message: "due_date must be after issue_date." },
	)
	.refine(
		(params) =>
			params.due_date === undefined || params.net_terms_days === undefined,
		{ message: "Provide due_date or net_terms_days, not both." },
	);

export const CreateInvoicePreviewLineSchema = z.object({
	plan_id: z.string().nullable(),
	feature_id: z.string().nullable(),
	entity_id: z.string().nullable().meta({
		description:
			"The entity this line is billed to. Null for customer-level lines.",
	}),
	description: z.string(),
	amount: z.number(),
	amount_after_discounts: z.number(),
	quantity: z.number().nullable(),
	prorated: z.boolean(),
	period_start: z.number().nullable(),
	period_end: z.number().nullable(),
});

export const CreateInvoicePreviewSchema = z.object({
	currency: z.string(),
	lines: z.array(CreateInvoicePreviewLineSchema),
	subtotal: z.number(),
	discount_total: z.number(),
	tax: z
		.object({
			total: z.number(),
			amount_inclusive: z.number(),
			amount_exclusive: z.number(),
			status: z.enum(["complete", "incomplete", "requires_location"]),
		})
		.nullable(),
	total: z.number(),
	invoice_credits: PreviewInvoiceCreditsSchema.optional().meta({
		description:
			"The customer's Stripe credit balance and how much of it this invoice consumes.",
	}),
	amount_due: z.number().meta({
		description: "What the customer pays: the total less any credit applied.",
	}),
	issue_date: z.number(),
	due_date: z.number().nullable(),
});

export const CreateInvoiceResponseSchema = z.object({
	invoice: ApiListInvoiceV1Schema.nullable().meta({
		description: "The created invoice. Null when preview is true.",
	}),
	preview: CreateInvoicePreviewSchema,
});

export type CreateInvoiceParams = z.infer<typeof CreateInvoiceParamsSchema>;
export type CreateInvoiceParamsInput = z.input<
	typeof CreateInvoiceParamsSchema
>;
export type InvoicePlanParams = z.infer<typeof InvoicePlanParamsSchema>;
export type InvoiceCustomize = z.infer<typeof InvoiceCustomizeSchema>;
export type InvoiceCustomizeItem = z.infer<typeof InvoiceCustomizeItemSchema>;
export type InvoiceFeatureQuantity = z.infer<
	typeof InvoiceFeatureQuantitySchema
>;
export type InvoiceUsageEntry = z.infer<typeof InvoiceUsageEntrySchema>;
export type InvoiceLicenseQuantity = z.infer<
	typeof InvoiceLicenseQuantitySchema
>;
export type CreateInvoicePreview = z.infer<typeof CreateInvoicePreviewSchema>;
export type CreateInvoicePreviewLine = z.infer<
	typeof CreateInvoicePreviewLineSchema
>;
export type InvoiceIssueMethod = z.infer<typeof InvoiceIssueMethodSchema>;
export type CreateInvoiceResponse = z.infer<typeof CreateInvoiceResponseSchema>;
