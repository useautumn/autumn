import {
	customerPriceToCustomerEntitlement,
	ErrCode,
	type FullCusProduct,
	type FullCustomerPrice,
	getFeatureInvoiceDescription,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import { getPriceForOverage } from "@server/internal/products/prices/priceUtils";
import RecaseError from "@server/utils/errorUtils";
import { Decimal } from "decimal.js";
import { getTotalNegativeBalance } from "../cusEnts/cusEntUtils";

// Get overage for a cusPrice
export const getCusPriceUsage = ({
	cusPrice,
	price,
	cusProduct,
	logger,
	withProdPrefix = true,
}: {
	cusPrice?: FullCustomerPrice;
	price?: Price;
	cusProduct: FullCusProduct;
	logger: any;
	withProdPrefix?: boolean;
}) => {
	if (!cusPrice) {
		cusPrice = cusProduct.customer_prices.find(
			(cp) => cp.price.id === price!.id,
		);
		if (!cusPrice) {
			throw new RecaseError({
				message: `getCusPriceUsage: No cusPrice found for price: ${price!.id}`,
				code: ErrCode.CusPriceNotFound,
			});
		}
	}

	// 1. Get related cusEnt
	const cusEnt = customerPriceToCustomerEntitlement({
		customerPrice: cusPrice,
		customerEntitlements: cusProduct.customer_entitlements,
	});
	const config = cusPrice.price.config as UsagePriceConfig;

	if (!cusEnt) {
		logger.warn(`No cusEnt found for cusPrice: ${cusPrice.id}`);
		return {
			amount: 0,
			description: "",
			usage: 0,
			overage: 0,
			roundedUsage: 0,
		};
	}

	// 2. Get overage
	const totalNegativeBalance = getTotalNegativeBalance({
		cusEnt: cusEnt as any,
		balance: cusEnt.balance!,
		entities: cusEnt.entities!,
		billingUnits:
			(cusPrice.price.config as UsagePriceConfig).billing_units || 1,
	});

	const allowance = cusEnt.entitlement.allowance || 0;
	const usage = new Decimal(allowance).minus(totalNegativeBalance).toNumber();
	const billingUnits = config.billing_units || 1;

	const roundedQuantity =
		Math.ceil(new Decimal(usage).div(billingUnits).toNumber()) * billingUnits;

	const amount = getPriceForOverage({
		price: cusPrice.price,
		overage: -totalNegativeBalance,
	});

	let description = getFeatureInvoiceDescription({
		feature: cusEnt.entitlement.feature,
		usage,
	});

	if (withProdPrefix) {
		description = `${cusProduct.product.name} - ${description}`;
	}

	return {
		usage, // total usage
		overage: -totalNegativeBalance, // usage that's past the allowance
		roundedUsage: roundedQuantity, // usage rounded to the nearest billing unit
		amount,
		description,
	};
};
