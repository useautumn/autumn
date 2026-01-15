import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { ProductStatus } from "autumn-js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";

// UNCOMMENT FROM HERE
const premium = constructProduct({
	type: "premium",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const pro = constructProduct({
	type: "pro",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 50,
		}),
	],
});

describe(`${chalk.yellowBright("cancel6: Downgrade from premium to pro, then cancel premium end of cycle")}`, () => {
	const customerId = "cancel6";
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

	test("should attach premium and pro, then cancel premium end of cycle", async () => {
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
			cancel_immediately: false,
		});
	});

	test("should have correct product and subscriptions after cancellation", async () => {
		const customer = await autumn.customers.get(customerId);

		const premiumProduct = customer.products.find((p) => p.id === premium.id);
		const proProduct = customer.products.find((p) => p.id === pro.id);

		expect(premiumProduct).toBeDefined();
		expect(premiumProduct?.canceled_at).toBeDefined();
		expect(premiumProduct?.status).toBe(ProductStatus.Active);
		expect(proProduct).toBeUndefined();

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: true,
		});
	});

	test("should attach pro again and have correct product and subscriptions", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer: customer,
			product: premium,
			status: CusProductStatus.Active,
		});
		expectProductAttached({
			customer: customer,
			product: pro,
			status: CusProductStatus.Scheduled,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: false,
		});
	});
});
