import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "check-loose3";

describe(`${chalk.yellowBright("check-loose3: mixed product + loose entitlement")}`, () => {
	const customerId = "check-loose3";
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});

		// Attach product first (gives 100 messages)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});

		// Then add loose entitlement for same feature (adds 500 more)
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 500,
		});
	});

	test("v2: combined balance should include both sources", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.customer_id).toBe(customerId);
		expect(res.balance).toBeDefined();

		// Total should be 100 (product) + 500 (loose) = 600
		expect(res.balance?.granted_balance).toBe(600);
		expect(res.balance?.current_balance).toBe(600);

		// When mixed sources, plan_id should be null and breakdown should exist
		expect(res.balance?.breakdown?.find((b) => b.plan_id === null)).toBeDefined();
		expect(res.balance?.breakdown).toBeDefined();
		expect(res.balance?.breakdown).toHaveLength(2);
	});

	test("v2: breakdown should show each source separately", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const breakdown = res.balance?.breakdown;
		expect(breakdown).toBeDefined();
		expect(breakdown).toHaveLength(2);

		// Find the product entitlement (has plan_id)
		const productEnt = breakdown?.find((b) => b.plan_id === freeProd.id);
		expect(productEnt).toBeDefined();
		expect(productEnt?.granted_balance).toBe(100);

		// Find the loose entitlement (plan_id is null)
		const looseEnt = breakdown?.find((b) => b.plan_id === null);
		expect(looseEnt).toBeDefined();
		expect(looseEnt?.granted_balance).toBe(500);
	});

	test("v2: should allow high required_balance with combined sources", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 550, // More than either source alone, but less than combined
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.required_balance).toBe(550);
	});

	test("v2: should deny when exceeds combined balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 700, // More than combined 600
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(false);
		expect(res.required_balance).toBe(700);
		expect(res.balance?.current_balance).toBe(600);
	});
});
