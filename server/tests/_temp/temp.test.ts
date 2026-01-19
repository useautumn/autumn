import { beforeAll, describe } from "bun:test";
import {
	ApiVersion,
	BillingInterval,
	type FullProduct,
	isConsumablePrice,
	isFixedPrice,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { ProductService } from "@/internal/products/ProductService";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import {
	constructArrearItem,
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";

const prepaidUsersItem = constructPrepaidItem({
	featureId: TestFeature.Users,
	billingUnits: 1,
	price: 10,
});

const free = constructProduct({
	type: "free",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 500,
		}),
	],
});

const growthYearly = constructRawProduct({
	id: "growth-yearly",
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 0,
			price: 1,
			billingUnits: 100,
		}),
		constructPriceItem({
			price: 2000,
			interval: BillingInterval.Year,
		}),
	],
});

const testCase = "temp";

const buildSubscriptionItems = ({
	fullProduct,
}: {
	fullProduct: FullProduct;
}): Stripe.SubscriptionScheduleCreateParams.Phase.Item[] => {
	return fullProduct.prices.map((p) => {
		if (isConsumablePrice(p)) {
			return {
				price: p.config.stripe_empty_price_id ?? undefined,
				quantity: 0,
			};
		}
		return {
			price: p.config.stripe_price_id ?? undefined,
			quantity: 1,
		};
	});
};

describe(`${chalk.yellowBright("temp:	 add on")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		// await initCustomerV3({
		// 	ctx,
		// 	customerId,
		// 	withTestClock: true,
		// 	attachPm: "success",
		// });

		// await initProductsV0({
		// 	ctx,
		// 	products: [free, growthYearly],
		// 	prefix: testCase,
		// });

		const { stripeCli } = ctx;

		const growthYearly = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: "growth-yearly_temp",
		});

		// const basePrice = growthYearly.prices.find(isFixedPrice)

		// const emptyPrice = await stripeCli.prices.create({
		// 	product: growthYearly?.processor?.id,
		// 	unit_amount: 0,
		// 	currency: "usd",
		// 	recurring: {
		// 		...(billingIntervalToStripe({
		// 			interval: BillingInterval.Year,
		// 			intervalCount: 1,
		// 		}) as any),
		// 	},
		// });

		// console.log(emptyPrice);

		const newSubscription = await stripeCli.subscriptions.create({
			customer: "cus_ToYUVA6XSJrMa8",
			items: [
				{
					price: "price_1SqvPM5NEqgjQ4gyNktukeYr",
					quantity: 1,
				},
			],
			billing_mode: { type: "flexible" },
			billing_cycle_anchor: Math.floor(new Date("2026-12-26").getTime() / 1000),
		});

		await stripeCli.subscriptions.update(newSubscription.id, {
			items: [
				{
					id: newSubscription.items.data[0].id,
					deleted: true,
				},
				...buildSubscriptionItems({ fullProduct: growthYearly })
			],
			proration_behavior: "none",
		});
	});
});

// await createReward({
// 	db: ctx.db,
// 	orgId: ctx.org.id,
// 	env: ctx.env,
// 	autumn: autumnV1,
// 	reward,
// 	// productId: pro.id,
// });
