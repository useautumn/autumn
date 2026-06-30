import { Infinite } from "@models/productModels/productEnums.js";
import { z } from "zod/v4";

export const AdditionalCurrencyPriceSchema = z.object({
	currency: z.string().min(1).meta({
		description: "Three-letter ISO currency code (e.g. 'eur', 'gbp').",
	}),
	amount: z.number().meta({
		description:
			"Price amount in this currency. Set explicitly per currency, not converted from the base amount.",
	}),
});

export type AdditionalCurrencyPrice = z.infer<
	typeof AdditionalCurrencyPriceSchema
>;

export const AdditionalCurrencyTierSchema = z
	.object({
		currency: z.string().min(1).meta({
			description: "Three-letter ISO currency code (e.g. 'eur', 'gbp').",
		}),
		amount: z.number().optional().meta({
			description: "Per-unit amount for this tier in this currency.",
		}),
		flat_amount: z.number().optional().meta({
			description:
				"Flat amount for this tier in this currency, if the tier uses one.",
		}),
	})
	.refine((val) => val.amount !== undefined || val.flat_amount !== undefined, {
		message: "Either amount or flat_amount, or both must be defined",
		path: ["amount", "flat_amount"],
	});

export type AdditionalCurrencyTier = z.infer<
	typeof AdditionalCurrencyTierSchema
>;

// Reject the same currency twice in one list (case-insensitive). Lowercase
// normalization itself is deferred to the write-path mapper (task 0.2).
const hasNoDuplicateCurrencies = (entries: { currency: string }[]) => {
	const seen = new Set<string>();
	for (const { currency } of entries) {
		const key = currency.toLowerCase();
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
	}
	return true;
};

const DUPLICATE_CURRENCY_MESSAGE =
	"Each currency may appear at most once in additional_currencies.";

export const AdditionalCurrencyPriceArraySchema = z
	.array(AdditionalCurrencyPriceSchema)
	.refine(hasNoDuplicateCurrencies, { message: DUPLICATE_CURRENCY_MESSAGE });

export const AdditionalCurrencyTierArraySchema = z
	.array(AdditionalCurrencyTierSchema)
	.refine(hasNoDuplicateCurrencies, { message: DUPLICATE_CURRENCY_MESSAGE });

// API-only tier shape: the storage UsageTierSchema plus per-currency amounts.
// Kept separate so this public projection never leaks into the jsonb price config.
export const ApiUsageTierWithCurrenciesSchema = z
	.object({
		to: z.number().or(z.literal(Infinite)),
		amount: z.number().optional(),
		flat_amount: z.number().optional(),
		additional_currencies: AdditionalCurrencyTierArraySchema.optional().meta({
			description:
				"Per-currency amounts for this tier. Tier boundaries ('to') are shared across all currencies.",
		}),
	})
	.refine((val) => val.amount !== undefined || val.flat_amount !== undefined, {
		message: "Either amount or flat_amount, or both must be defined",
		path: ["amount", "flat_amount"],
	})
	.transform((val) => ({ ...val, amount: val.amount ?? 0 }))
	.pipe(
		z.object({
			to: z.number().or(z.literal(Infinite)),
			amount: z.number(),
			flat_amount: z.number().optional(),
			additional_currencies: AdditionalCurrencyTierArraySchema.optional(),
		}),
	);

type PlanItemPriceForCurrencyCheck = {
	amount?: number | null;
	additional_currencies?: { currency: string }[];
	tiers?: { additional_currencies?: { currency: string }[] }[] | null;
};

// Cross-field invariants for additional_currencies on a plan-item price.
// Shared by the response and params schemas so the rules can't drift; returns
// messages and lets the caller push them as schema issues.
export const additionalCurrencyPlanItemIssues = (
	price: PlanItemPriceForCurrencyCheck | null | undefined,
): string[] => {
	if (!price) {
		return [];
	}
	const issues: string[] = [];

	if (
		price.additional_currencies &&
		price.additional_currencies.length > 0 &&
		typeof price.amount !== "number"
	) {
		issues.push(
			"price.additional_currencies requires a flat 'amount'; tiered prices carry per-currency amounts on each tier.",
		);
	}

	const tiers = price.tiers;
	if (tiers && tiers.length > 0) {
		const currencyKeys = (tier: {
			additional_currencies?: { currency: string }[];
		}) =>
			(tier.additional_currencies ?? []).map((c) => c.currency.toLowerCase());

		const allCurrencies = new Set(tiers.flatMap(currencyKeys));
		if (allCurrencies.size > 0) {
			const everyTierHasAll = tiers.every((tier) => {
				const keys = new Set(currencyKeys(tier));
				return (
					keys.size === allCurrencies.size &&
					[...allCurrencies].every((currency) => keys.has(currency))
				);
			});
			if (!everyTierHasAll) {
				issues.push(
					"Each additional currency must be present on every tier or none.",
				);
			}
		}
	}

	return issues;
};
