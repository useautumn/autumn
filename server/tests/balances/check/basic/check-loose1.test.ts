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

const testCase = "check-loose1";

describe(`${chalk.yellowBright("check-loose1: basic loose entitlement check")}`, () => {
	const customerId = "check-loose1";
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

		// Create loose entitlement (no product attached)
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 500,
		});
	});

	test("v2: loose entitlement should be allowed with plan_id null", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.customer_id).toBe(customerId);
		expect(res.balance).toBeDefined();
		expect(res.balance?.plan_id).toBeNull();
		expect(res.balance?.feature_id).toBe(TestFeature.Messages);
		expect(res.balance?.granted_balance).toBe(500);
		expect(res.balance?.current_balance).toBe(500);
		expect(res.balance?.usage).toBe(0);
		expect(res.balance?.unlimited).toBe(false);
	});

	test("v2: should respect required_balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 400,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.required_balance).toBe(400);
	});

	test("v2: should return allowed=false for insufficient balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 999,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(false);
		expect(res.required_balance).toBe(999);
		expect(res.balance?.current_balance).toBe(500);
	});
});
