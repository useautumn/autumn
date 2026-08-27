import { orgToCurrency, type Price } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { copyAttachCurrencyStripeSlot } from "./copyAttachCurrencyStripeSlot.js";

export const stampAttachCurrencyStripeSlot = async ({
	ctx,
	targetPrice,
	sourcePrice,
	currency,
}: {
	ctx: AutumnContext;
	targetPrice: Price;
	sourcePrice: Price;
	currency: string;
}) => {
	const copied = copyAttachCurrencyStripeSlot({
		targetPrice,
		sourcePrice,
		currency,
		orgDefaultCurrency: orgToCurrency({ org: ctx.org }).toLowerCase(),
	});
	if (!copied) return;

	await PriceService.update({
		db: ctx.db,
		id: targetPrice.id,
		update: { config: targetPrice.config },
	});
};
