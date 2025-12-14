import { BillingInterval } from "../../../../models/productModels/intervals/billingInterval";
import type { FixedPriceConfig } from "../../../../models/productModels/priceModels/priceConfig/fixedPriceConfig";
import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { formatAmount } from "../../../common/formatUtils/formatAmount";
import { formatInterval } from "../../../common/formatUtils/formatInterval";

export const fixedPriceToDescription = ({
	price,
	currency,
}: {
	price: Price; // must be fixed price
	currency?: string;
}): string => {
	const config = price.config as FixedPriceConfig;
	const amount = formatAmount({ currency, amount: config.amount });

	if (config.interval === BillingInterval.OneOff) {
		return amount;
	}

	const intervalStr = formatInterval({
		interval: config.interval,
		intervalCount: config.interval_count || 1,
		prefix: "",
	});

	return `${amount} / ${intervalStr}`; // "$10 / month"
};
