import {
	type CurrencyStripeIdSlot,
	orgToCurrency,
	type Price,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { copyAttachCurrencyStripeSlot } from "./copyAttachCurrencyStripeSlot.js";
import { copyReusableStripeProductId } from "./copyReusableStripeProductId.js";
import { copyReusableUsageMeter } from "./copyReusableUsageMeter.js";

export const stampAttachCurrencyStripeSlot = async ({
	ctx,
	targetPrice,
	sourcePrice,
	currency,
	slot = "stripe_price_id",
}: {
	ctx: AutumnContext;
	targetPrice: Price;
	sourcePrice: Price;
	currency: string;
	slot?: CurrencyStripeIdSlot;
}) => {
	const copied = copyAttachCurrencyStripeSlot({
		targetPrice,
		sourcePrice,
		currency,
		orgDefaultCurrency: orgToCurrency({ org: ctx.org }).toLowerCase(),
		slot,
	});
	if (!copied) return;

	copyReusableStripeProductId({ targetPrice, sourcePrice });
	copyReusableUsageMeter({ targetPrice, sourcePrice });

	await PriceService.update({
		db: ctx.db,
		id: targetPrice.id,
		update: { config: targetPrice.config },
	});
};
