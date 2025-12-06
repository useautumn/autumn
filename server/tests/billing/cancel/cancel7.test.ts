import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const premium = constructProduct({
	type: "premium",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 100,
		}),
	],
});

const pro = constructProduct({
	type: "pro",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 50,
		}),
	],
});

describe(`${chalk.yellowBright("cancel7: Downgrade from premium to pro, then cancel premium immediately")}`, () => {
	const customerId = "cancel7";
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [premium, pro],
			prefix: customerId,
		});
	});

	test("should attach premium and pro, then cancel premium immediately", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await autumn.cancel({
			customer_id: customerId,
			product_id: premium.id,
			cancel_immediately: true,
		});
	});

	test("should have correct product and subscriptions after cancellation", async () => {
		const customer = await autumn.customers.get(customerId);

		const premiumProduct = customer.products.find((p) => p.id === premium.id);
		const proProduct = customer.products.find((p) => p.id === pro.id);

		expect(premiumProduct).toBeUndefined();
		expect(proProduct).toBeUndefined();

		const stripeSubs = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id!,
		});

		expect(stripeSubs.data).toHaveLength(0);
	});
});
