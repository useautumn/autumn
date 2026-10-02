import type {
	ProcessorItemPrice,
	ProcessorItemPriceTier,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

const tierCharge = ({
	tier,
	units,
}: {
	tier: ProcessorItemPriceTier;
	units: number;
}) => new Decimal(tier.unit_amount).mul(units).plus(tier.flat_amount);

const coversQuantity = ({
	tier,
	quantity,
}: {
	tier: ProcessorItemPriceTier;
	quantity: number;
}) => tier.up_to === null || quantity <= tier.up_to;

/** The whole quantity at the rate of the tier it lands in. */
const volumeAmount = ({
	tiers,
	quantity,
}: {
	tiers: ProcessorItemPriceTier[];
	quantity: number;
}) => {
	const tier = tiers.find((candidate) =>
		coversQuantity({ tier: candidate, quantity }),
	);
	return tier ? tierCharge({ tier, units: quantity }) : null;
};

/** Each band of the quantity at its own tier's rate, plus the flat fee of every tier reached. */
const graduatedAmount = ({
	tiers,
	quantity,
}: {
	tiers: ProcessorItemPriceTier[];
	quantity: number;
}) => {
	let amount = new Decimal(0);
	let tierStart = 0;
	for (const tier of tiers) {
		const tierEnd = Math.min(quantity, tier.up_to ?? quantity);
		if (tierEnd <= tierStart) break;
		amount = amount.plus(tierCharge({ tier, units: tierEnd - tierStart }));
		tierStart = tierEnd;
	}
	return amount;
};

/** What Stripe charges for a licensed quantity on a tiered price. */
export const tieredProcessorItemAmount = ({
	price,
	quantity,
}: {
	price: ProcessorItemPrice;
	quantity: number;
}) => {
	if (!price.tiers || !price.tiers_mode) return null;
	const amount =
		price.tiers_mode === "volume"
			? volumeAmount({ tiers: price.tiers, quantity })
			: graduatedAmount({ tiers: price.tiers, quantity });
	return amount?.toNumber() ?? null;
};
