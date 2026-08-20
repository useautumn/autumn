import type { BasePriceParams } from "@api/products/components/basePrice/basePrice";
import { additionalCurrenciesToKey } from "@utils/planV1Utils/convertPlanItem/additionalCurrenciesToKey";

export const basePriceToKey = ({ price }: { price: BasePriceParams }): string =>
	[
		`amount:${price.amount}`,
		`interval:${price.interval}`,
		`interval_count:${price.interval_count ?? 1}`,
		`additional_currencies:${additionalCurrenciesToKey({ currencies: price.additional_currencies })}`,
	].join(",");
