import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features, products } from "tests/global.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
		// constructFixedPrice({
		//   price: 0,
		// }),
	],
});

const testCase = "basic1";

describe(`${chalk.yellowBright("basic1: Testing attach free product")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: "test" },
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});
	});

	test("should create customer and have default free active", async () => {
		const data = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.free,
			cusRes: data,
		});
	});

	test("should have correct entitlements", async () => {
		const expectedEntitlement = products.free.entitlements.metered1;

		const entitled = (await AutumnCli.entitled(
			customerId,
			features.metered1.id,
		)) as any;

		const metered1Balance = entitled.balances.find(
			(balance: any) => balance.feature_id === features.metered1.id,
		);

		expect(entitled.allowed).toBe(true);
		expect(metered1Balance).toBeDefined();
		expect(metered1Balance.balance).toBe(expectedEntitlement.allowance);
		expect(metered1Balance.unlimited).toBeUndefined();
	});

	test("should have correct boolean1 entitlement", async () => {
		const entitled = await AutumnCli.entitled(customerId, features.boolean1.id);
		expect(entitled!.allowed).toBe(false);
	});

	test("should attach free (with $0 price) and force checkout and succeed", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: freeProd.id,
			force_checkout: true,
		});

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: freeProd,
		});

		expectFeaturesCorrect({
			customer,
			product: freeProd,
		});
	});
});
