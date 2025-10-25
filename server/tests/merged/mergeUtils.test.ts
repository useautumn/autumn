import {
	ApiVersion,
	type AppEnv,
	cusProductToEnts,
	cusProductToPrices,
	cusProductToProduct,
	type FullCusProduct,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { priceToStripeItem } from "@/external/stripe/priceToStripeItem/priceToStripeItem.js";
import { CusService } from "@/internal/customers/CusService.js";
import { isFixedPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import {
	getPriceEntitlement,
	getPriceOptions,
} from "@/internal/products/prices/priceUtils.js";

export const cusProductToSubIds = ({
	cusProducts,
}: {
	cusProducts: FullCusProduct[];
}) => {
	return [...new Set(cusProducts.flatMap((cp) => cp.subscription_ids || []))];
};

export const cpToPrice = ({
	cp,
	type,
}: {
	cp: FullCusProduct;
	type: "base" | "arrear" | "cont" | "prepaid";
}) => {
	const prices = cusProductToPrices({ cusProduct: cp });
	return prices.find((p) => isFixedPrice({ price: p }));
};

export const expectSubToBeCorrect = async ({
	db,
	customerId,
	org,
	env,
}: {
	db: DrizzleCli;
	customerId: string;
	org: Organization;
	env: AppEnv;
}) => {
	const stripeCli = createStripeCli({ org, env });
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
	});

	// 1. Only 1 sub ID available
	const cusProducts = fullCus.customer_products;
	const subIds = cusProductToSubIds({ cusProducts });
	expect(subIds.length, "should only have 1 sub ID available").to.equal(1);

	// Get the items that should be in the sub
	const supposedSubItems = [];

	for (const cusProduct of cusProducts) {
		const prices = cusProductToPrices({ cusProduct });
		const ents = cusProductToEnts({ cusProduct });
		const product = cusProductToProduct({ cusProduct });
		for (const price of prices) {
			const relatedEnt = getPriceEntitlement(price, ents);
			const options = getPriceOptions(price, cusProduct.options);

			const res = priceToStripeItem({
				price,
				relatedEnt,
				product,
				org,
				options,
				existingUsage: 0,
				withEntity: true,
				isCheckout: false,
				apiVersion: ApiVersion.V1_Beta,
			});

			const lineItem: any = res?.lineItem;
			if (lineItem && res?.lineItem) {
				const existingIndex = supposedSubItems.findIndex(
					(si: any) => si.price === lineItem.price,
				);
				if (existingIndex !== -1) {
					supposedSubItems[existingIndex].quantity += lineItem.quantity!;
				} else {
					supposedSubItems.push(res.lineItem);
				}
			}
		}
	}

	const sub = await stripeCli.subscriptions.retrieve(subIds[0]);

	const actualItems = sub.items.data.map((item: any) => ({
		price: item.price.id,
		quantity: item.quantity || 0,
	}));

	// Check for missing items and quantity mismatches
	for (const expectedItem of supposedSubItems) {
		const actualItem = actualItems.find(
			(item: any) => item.price === (expectedItem as any).price,
		);

		if (!actualItem) {
			console.log("Missing item:", expectedItem);
		}

		expect(actualItem).to.exist;
		expect(actualItem?.quantity).to.equal((expectedItem as any).quantity);
	}

	// Check that number of sub items between the two are the same
	expect(actualItems.length).to.equal(supposedSubItems.length);
};
