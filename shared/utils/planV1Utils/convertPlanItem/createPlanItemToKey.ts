import type { CreatePlanItemParamsV1 } from "@api/products/items/crud/createPlanItemParamsV1";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import { additionalCurrenciesToKey } from "@utils/planV1Utils/convertPlanItem/additionalCurrenciesToKey";

type PlanItemPrice = NonNullable<CreatePlanItemParamsV1["price"]>;

const ABSENT = "";

const itemTiersToKey = ({
	tiers,
}: {
	tiers: NonNullable<PlanItemPrice["tiers"]>;
}): string =>
	tiers
		.map(
			(tier) =>
				`to:${tier.to},amount:${tier.amount ?? 0},flat_amount:${tier.flat_amount ?? ""},additional_currencies:${additionalCurrenciesToKey({ currencies: tier.additional_currencies })}`,
		)
		.join(";");

const itemPriceToKey = ({
	price,
}: {
	price: PlanItemPrice | null | undefined;
}): string => {
	if (price == null) return ABSENT;
	const tierBehavior = price.tiers?.length
		? (price.tier_behavior ?? TierBehavior.Graduated)
		: "";
	return [
		`amount:${price.amount ?? ""}`,
		`additional_currencies:${additionalCurrenciesToKey({ currencies: price.additional_currencies })}`,
		`tiers:${price.tiers?.length ? itemTiersToKey({ tiers: price.tiers }) : ""}`,
		`tier_behavior:${tierBehavior}`,
		`interval:${price.interval}`,
		`interval_count:${price.interval_count ?? 1}`,
		`billing_units:${price.billing_units ?? 1}`,
		`billing_method:${price.billing_method}`,
		`max_purchase:${price.max_purchase ?? ""}`,
	].join(",");
};

/** Full payload identity of a create-plan item — not the slot match key. */
export const createPlanItemToKey = ({
	item,
}: {
	item: CreatePlanItemParamsV1;
}): string =>
	[
		`feature_id:${item.feature_id}`,
		`entity_feature_id:${item.entity_feature_id ?? ""}`,
		`pooled:${item.pooled ?? false}`,
		`included:${item.included ?? 0}`,
		`unlimited:${item.unlimited ?? false}`,
		`reset.interval:${item.reset?.interval ?? ""}`,
		`reset.interval_count:${item.reset?.interval_count ?? 1}`,
		`price:${itemPriceToKey({ price: item.price })}`,
		`proration.on_increase:${item.proration?.on_increase ?? ""}`,
		`proration.on_decrease:${item.proration?.on_decrease ?? ""}`,
		`rollover.max:${item.rollover?.max ?? ""}`,
		`rollover.max_percentage:${item.rollover?.max_percentage ?? ""}`,
		`rollover.expiry_duration_type:${item.rollover?.expiry_duration_type ?? ""}`,
		`rollover.expiry_duration_length:${item.rollover?.expiry_duration_length ?? ""}`,
	].join(",");
