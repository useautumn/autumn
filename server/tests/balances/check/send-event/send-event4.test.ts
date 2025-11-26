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
import { getCreditCost } from "../../../../src/internal/features/creditSystemUtils";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "free",
	isDefault: true,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			unlimited: true,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			unlimited: true,
		}),
	],
});

describe(`${chalk.yellowBright("send-event4: Testing check with track, unlimited feature")}`, () => {
	const customerId = "send-event4";
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
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
			products: [pro],
			prefix: customerId,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	test("should check with track messages and have correct response", async () => {
		const checkRes = await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1000,
			send_event: true,
		});

		expect(checkRes).toMatchObject({
			allowed: true,
			customer_id: customerId,
			required_balance: 1000,
		});

		expect(checkRes.balance).toMatchObject({
			feature_id: TestFeature.Messages,
			current_balance: 0,
			usage: 0,
			granted_balance: 0,
		});
	});

	test("should check with track action1 and have correct response", async () => {
		const checkRes = await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 1000,
			send_event: true,
		});

		const requiredBalance = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: ctx.features.find((f) => f.id === TestFeature.Credits)!,
			amount: 1000,
		});

		expect(checkRes).toMatchObject({
			allowed: true,
			customer_id: customerId,
			required_balance: requiredBalance,
		});

		expect(checkRes.balance).toMatchObject({
			feature_id: TestFeature.Credits,
			current_balance: 0,
			usage: 0,
			granted_balance: 0,
		});
	});
});
