import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV2,
	ResetInterval,
} from "@autumn/shared";
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

const testCase = "check-loose4";

describe(`${chalk.yellowBright("check-loose4: loose entitlement with reset interval")}`, () => {
	const customerId = "check-loose4";
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

		// Create loose entitlement with monthly reset
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			granted_balance: 1000,
			reset: {
				interval: ResetInterval.Month,
				interval_count: 1,
			},
		});
	});

	test("v2: loose entitlement with reset should include reset info", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.customer_id).toBe(customerId);
		expect(res.balance).toBeDefined();
		expect(res.balance?.plan_id).toBeNull();
		expect(res.balance?.feature_id).toBe(TestFeature.Action1);
		expect(res.balance?.granted_balance).toBe(1000);
		expect(res.balance?.current_balance).toBe(1000);

		// Reset info should be present
		expect(res.balance?.reset).toBeDefined();
		expect(res.balance?.reset?.interval).toBe(ResetInterval.Month);
		expect(res.balance?.reset?.resets_at).toBeDefined();
	});
});
