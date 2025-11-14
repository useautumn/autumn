import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import { expectFeaturesCorrect } from "@tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { initCustomerV3 } from "../../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { sharedDefaultFree } from "./sharedProducts.js";

const free2 = constructProduct({
	type: "free",
	id: "free2",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
	],
});

const testCase = "basic1";
const customerId = testCase;

describe(`${chalk.yellowBright("basic1: Testing attach free, default product")}`, () => {
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	beforeAll(async () => {
		// Create products FIRST so default product can be attached to customer
		await initProductsV0({
			ctx,
			products: [free2],
			prefix: testCase,
			customerId,
		});

		// Then create customer (will auto-attach default product if exists)
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			withDefault: true,
		});
	});

	test("should create customer and have default free active", async () => {
		const data = await AutumnCli.getCustomer(customerId);

		await expectCustomerV0Correct({
			sent: sharedDefaultFree,
			cusRes: data,
		});
	});

	test("should have correct entitlements", async () => {
		// Expected: 5 allowance for Messages feature
		const entitled = (await AutumnCli.entitled(
			customerId,
			TestFeature.Messages,
		)) as any;

		const metered1Balance = entitled.balances.find(
			(balance: any) => balance.feature_id === TestFeature.Messages,
		);

		expect(entitled.allowed).toBe(true);
		expect(metered1Balance).toBeDefined();
		expect(metered1Balance.balance).toBe(5);
		expect(metered1Balance.unlimited).toBeUndefined();
	});

	test("should have correct boolean1 entitlement", async () => {
		// Dashboard feature is not included in freeProd, should be false
		const entitled = await AutumnCli.entitled(
			customerId,
			TestFeature.Dashboard,
		);
		expect(entitled!.allowed).toBe(false);
	});

	test("should attach free (with $0 price) and force checkout and succeed", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free2.id,
			force_checkout: true,
		});
		const customer = await autumnV1.customers.get(customerId);

		expectProductAttached({
			customer,
			product: free2,
		});

		expectFeaturesCorrect({
			customer,
			product: free2,
			otherProducts: [sharedDefaultFree],
		});
	});
});
