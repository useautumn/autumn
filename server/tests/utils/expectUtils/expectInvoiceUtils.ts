import {
	BillingInterval,
	type Organization,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { AppEnv } from "autumn-js";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	cusProductToEnts,
	cusProductToPrices,
} from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import {
	isArrearPrice,
	isFixedPrice,
} from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { getPriceEntitlement } from "@/internal/products/prices/priceUtils.js";
import { getSubsFromCusId } from "./expectSubUtils.js";

export const getExpectedInvoiceTotal = async ({
	customerId,
	productId,
	usage,
	stripeCli,
	db,
	org,
	env,
	onlyIncludeMonthly = false,
	onlyIncludeUsage = false,
	onlyIncludeArrear = false,
	expectExpired = false,
}: {
	customerId: string;
	productId: string;
	usage: {
		featureId: string;
		entityFeatureId?: string;
		value: number;
	}[];
	stripeCli: Stripe;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	onlyIncludeMonthly?: boolean;
	onlyIncludeUsage?: boolean;
	onlyIncludeArrear?: boolean;
	expectExpired?: boolean;
}) => {
	const { cusProduct } = await getSubsFromCusId({
		stripeCli,
		customerId,
		productId,
		db,
		org,
		env,
		withExpired: expectExpired,
	});

	const prices = cusProductToPrices({ cusProduct });
	const ents = cusProductToEnts({ cusProduct });

	let total = new Decimal(0);
	for (const price of prices) {
		if (onlyIncludeMonthly && price.config.interval !== BillingInterval.Month) {
			continue;
		}

		if (onlyIncludeUsage && isFixedPrice({ price })) continue;

		if (onlyIncludeArrear && !isArrearPrice({ price })) continue;

		const config = price.config as UsagePriceConfig;
		const featureId = config.feature_id;
		const ent = getPriceEntitlement(price, ents);

		const usageAmount = usage.find(
			(u) =>
				u.featureId === featureId &&
				(u.entityFeatureId
					? u.entityFeatureId === ent.entity_feature_id
					: true),
		)?.value;

		const overage =
			usageAmount && ent.allowance ? usageAmount - ent.allowance : usageAmount;

		const invoiceAmt = priceToInvoiceAmount({
			price,
			overage,
		});

		total = total.plus(invoiceAmt);
	}

	return total.toNumber();
};
