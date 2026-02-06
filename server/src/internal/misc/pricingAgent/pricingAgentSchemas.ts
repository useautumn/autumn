import { z } from "zod/v4";

// ============ VALIDATION HELPERS ============
const validateOneDefaultPerGroup = ({
	products,
}: {
	products: {
		is_default: boolean;
		group: string;
		free_trial?: { card_required: boolean } | null;
	}[];
}): boolean => {
	const productsByGroup = new Map<string, typeof products>();

	for (const product of products) {
		const group = product.group || "";
		if (!productsByGroup.has(group)) {
			productsByGroup.set(group, []);
		}
		productsByGroup.get(group)!.push(product);
	}

	for (const [_, groupProducts] of productsByGroup) {
		// Count products with is_default that DON'T have card-not-required free trials
		const defaultWithoutCardlessTrialCount = groupProducts.filter(
			(p) =>
				p.is_default && !(p.free_trial && p.free_trial.card_required === false),
		).length;

		if (defaultWithoutCardlessTrialCount > 1) {
			return false;
		}
	}

	return true;
};

// ============ SCHEMAS ============
const ApiFeatureType = z.enum([
	"static",
	"boolean",
	"single_use",
	"continuous_use",
	"credit_system",
]);

const ProductItemInterval = z.enum([
	"minute",
	"hour",
	"day",
	"week",
	"month",
	"quarter",
	"semi_annual",
	"year",
]);

const UsageModel = z.enum(["prepaid", "pay_per_use"]);
const FreeTrialDuration = z.enum(["day", "month", "year"]);

const FeatureSchema = z
	.object({
		id: z
			.string()
			.describe(
				"Unique ID for the feature (lowercase, underscores, no spaces)",
			),
		name: z.string().describe("Display name for the feature"),
		type: ApiFeatureType.describe(
			"Type: single_use for consumables, continuous_use for allocated resources, boolean for on/off",
		),
		display: z
			.object({
				singular: z
					.string()
					.describe(
						"Singular form of the unit (e.g., 'message', 'credit', 'seat', 'API call')",
					),
				plural: z
					.string()
					.describe(
						"Plural form of the unit (e.g., 'messages', 'credits', 'seats', 'API calls')",
					),
			})
			.describe(
				"REQUIRED for metered features (single_use, continuous_use, credit_system). Used for display like '100 messages' or '1 seat'.",
			),
		credit_schema: z
			.array(
				z.object({
					metered_feature_id: z.string(),
					credit_cost: z.number(),
				}),
			)
			.nullish(),
	})
	.refine(
		(data) => {
			if (data.type === "credit_system") {
				return data.credit_schema && data.credit_schema.length > 0;
			}
			return true;
		},
		{
			message:
				"Credit system features require at least one metered feature in credit_schema.",
			path: ["credit_schema"],
		},
	);

const PriceTierSchema = z.object({
	to: z
		.number()
		.or(z.literal("inf"))
		.describe("The upper limit of this tier (use 'inf' for unlimited)"),
	amount: z.number().describe("The price per unit for this tier"),
});

const ProductItemSchema = z.object({
	feature_id: z
		.string()
		.nullish()
		.describe(
			"Feature ID this item relates to. Set to null for standalone flat-fee price items (e.g., subscription base price, one-time purchase price).",
		),
	included_usage: z
		.number()
		.or(z.literal("inf"))
		.nullish()
		.describe(
			"Usage granted to the customer. Use WITHOUT price for free allocations. Use WITH usage_model and price for metered pricing.",
		),
	interval: ProductItemInterval.nullish().describe("Reset/billing interval"),
	price: z
		.number()
		.nullish()
		.describe(
			"Price amount. When feature_id is null, this is a standalone flat fee. When feature_id is set with usage_model, this is the per-unit price.",
		),
	tiers: z
		.array(PriceTierSchema)
		.nullish()
		.describe(
			"Tiered pricing structure. Use instead of price for volume-based pricing. Each tier defines upper limit (to) and price per unit (amount).",
		),
	usage_model: UsageModel.nullish().describe(
		"prepaid or pay_per_use. Required when pricing per unit of usage.",
	),
	billing_units: z
		.number()
		.nullish()
		.describe("Units per price (e.g., $1 per 30 credits)"),
});

const FreeTrialSchema = z
	.object({
		length: z.number().describe("Length of free trial"),
		duration: FreeTrialDuration.describe("Unit: day, month, or year"),
		unique_fingerprint: z.boolean().default(false),
		card_required: z.boolean().default(true),
	})
	.nullish();

const ProductSchema = z
	.object({
		id: z.string().describe("Unique ID (lowercase, hyphens allowed)"),
		name: z.string().describe("Display name"),
		is_add_on: z
			.boolean()
			.default(false)
			.describe(
				"Set to true if this product is an add-on or top-up, (can be purchased together with other base plans).",
			),
		is_default: z
			.boolean()
			.default(false)
			.describe(
				"Set to true ONLY if the items array is completely empty OR contains only items with price: null. ANY pricing items (including pay-per-use, overage charges, prepaid etc.) disqualifies a plan from being default.",
			),
		group: z
			.string()
			.default("")
			.describe(
				"A group to assign this plan to. Leave empty unless user is building pricing where a customer could subscribe to 2 or more types of plans at the same time.`",
			),
		items: z.array(ProductItemSchema).default([]),
		free_trial: FreeTrialSchema,
	})
	.refine(
		(data) => {
			if (data.is_default) {
				return data.items.every((item) => item.price == null);
			}
			return true;
		},
		{
			message:
				"Default plans cannot have priced items. All items must have price: null or undefined.",
			path: ["is_default"],
		},
	)
	.refine(
		(data) => {
			const usageBasedFeatureIds = new Set(
				data.items
					.filter((item) => item.feature_id != null && item.usage_model != null)
					.map((item) => item.feature_id),
			);
			// Check if any other items reference the same feature_id
			return !data.items.some(
				(item) =>
					item.feature_id != null &&
					item.usage_model == null &&
					usageBasedFeatureIds.has(item.feature_id),
			);
		},
		{
			message:
				"Cannot have separate items for the same feature when one has usage-based pricing. Combine into a single item (e.g., 100 free, then $0.10 per additional).",
			path: ["items"],
		},
	)
	.refine(
		(data) => {
			return !data.items.some(
				(item) => item.usage_model === "pay_per_use" && item.interval == null,
			);
		},
		{
			message:
				"Pay-per-use pricing requires an interval. Set interval (e.g., 'month') for usage-based items.",
			path: ["items"],
		},
	)
	.refine(
		(data) => {
			return !data.items.some(
				(item) =>
					item.price != null &&
					item.feature_id != null &&
					item.usage_model == null,
			);
		},
		{
			message:
				"Priced metered features require a usage_model. Set to 'pay_per_use' or 'prepaid'.",
			path: ["items"],
		},
	);

export const OrganisationConfigurationSchema = z
	.object({
		features: z.array(FeatureSchema).default([]),
		products: z.array(ProductSchema),
	})
	.refine((data) => validateOneDefaultPerGroup({ products: data.products }), {
		message:
			"Only one plan per group can have is_default: true, unless it also has a free trial with card_required: false.",
		path: ["products"],
	});

export type PricingConfig = z.infer<typeof OrganisationConfigurationSchema>;
