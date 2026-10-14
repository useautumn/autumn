import {
	type BillingContext,
	billingContextToCurrency,
	cusPriceToCusEntWithCusProduct,
	ErrCode,
	type FixedPriceConfig,
	type FullCusProduct,
	type FullCustomerPrice,
	InternalError,
	isAllocatedPrice,
	isConsumablePrice,
	isFixedPrice,
	isPrepaidPrice,
	orgToCurrency,
	type StripeItemSpec,
	type StripeItemSpecMode,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { allocatedToStripeItemSpec } from "./allocatedToStripeItemSpec";
import { consumableToStripeItemSpec } from "./consumableToStripeItemSpec";
import { fixedPriceToStripeItemSpec } from "./fixedPriceToStripeItemSpec";
import { prepaidToStripeItemSpec } from "./prepaidToStripeItemSpec";

export const cusPriceToStripeItemSpec = ({
	ctx,
	cusPrice,
	cusProduct,
	billingContext,
	options,
}: {
	ctx: AutumnContext;
	cusPrice: FullCustomerPrice;
	cusProduct: FullCusProduct;
	billingContext?: BillingContext;
	options?: { isDuplicateProductId?: boolean };
}): StripeItemSpec | null => {
	const price = cusPrice.price;

	const orgDefault = orgToCurrency({ org: ctx.org }).toLowerCase();
	const currency = billingContext
		? billingContextToCurrency({ org: ctx.org, billingContext })
		: orgDefault;

	const buildSpec = (mode?: StripeItemSpecMode): StripeItemSpec | null => {
		if (isFixedPrice(price)) {
			const config = price.config as FixedPriceConfig;
			if ((config.amount ?? 0) <= 0) return null;

			return fixedPriceToStripeItemSpec({
				cusPrice,
				cusProduct,
				currency,
				orgDefault,
				options: { mode },
			});
		}

		const cusEntWithCusProduct = cusPriceToCusEntWithCusProduct({
			cusProduct,
			cusPrice,
			cusEnts: cusProduct.customer_entitlements,
		});

		if (!cusEntWithCusProduct) {
			return null;
		}

		if (isPrepaidPrice(price)) {
			return prepaidToStripeItemSpec({
				ctx,
				cusEntWithCusProduct,
				currency,
				orgDefault,
				options: {
					...options,
					billingVersion: billingContext?.billingVersion,
					mode,
				},
			});
		}

		if (isConsumablePrice(price)) {
			return consumableToStripeItemSpec({
				cusEntWithCusProduct,
				currency,
				orgDefault,
			});
		}

		if (isAllocatedPrice(price)) {
			return allocatedToStripeItemSpec({
				cusEntWithCusProduct,
				currency,
				orgDefault,
			});
		}

		return null;
	};

	let spec: StripeItemSpec | null;
	try {
		spec = buildSpec();
	} catch (error) {
		const canRetryInline =
			billingContext?.actionSource === "verify" &&
			(isFixedPrice(price) || isPrepaidPrice(price));
		if (canRetryInline) {
			spec = buildSpec("inline");
		} else if (
			billingContext?.actionSource === "verify" &&
			error instanceof InternalError &&
			error.code === ErrCode.StripePriceNotLinked
		) {
			return null;
		} else {
			throw error;
		}
	}

	if (!spec) {
		return null;
	}

	spec.metadata = {
		autumn_product_id: cusProduct.product.id,
		autumn_price_id: price.id,
		autumn_customer_price_id: cusPrice.id,
		...(spec.metadata ?? {}),
	};

	return spec;
};
