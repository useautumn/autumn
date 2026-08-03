import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

export const getRewardPrices = async ({
	ctx,
	priceIds,
}: {
	ctx: AutumnContext;
	priceIds: string[];
}) => {
	const prices = await PriceService.getInIds({ db: ctx.db, ids: priceIds });
	const hasInvalidPrice =
		prices.length !== priceIds.length ||
		prices.some(
			(price) => price.org_id !== ctx.org.id || price.product.env !== ctx.env,
		);

	if (hasInvalidPrice) {
		throw new RecaseError({
			message: "One or more reward prices are invalid",
			code: ErrCode.InvalidPriceId,
			statusCode: 400,
		});
	}

	return prices;
};
