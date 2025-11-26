import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV1,
	type CheckResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { getCreditCost } from "../../../../src/internal/features/creditSystemUtils";
import { timeout } from "../../../utils/genUtils";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "free",
	isDefault: true,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Action1,
			includedUsage: 10,
		}),
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 100,
		}),
	],
});

describe(`${chalk.yellowBright("send-event3: Testing check with track, credit system")}`, () => {
	const customerId = "send-event3";
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
	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

	test("should check with track and deduct from action1 first", async () => {
		const checkRes = await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 5,
			send_event: true,
		});
		expect(checkRes.allowed).toBe(true);
		expect(checkRes.balance).toMatchObject({
			feature_id: TestFeature.Action1,
			current_balance: 5,
			usage: 5,
			granted_balance: 10,
		});

		await timeout(2000);
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		const action1Balance = customer.balances[TestFeature.Action1];
		expect(action1Balance).toMatchObject({
			current_balance: 5,
			usage: 5,
			granted_balance: 10,
		});
	});
	return;

	test("should check with track and deduct from action1 first, then credits", async () => {
		const checkRes = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 10,
			send_event: true,
		})) as unknown as CheckResponseV2;

		const creditCost = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: 10,
		});

		expect(checkRes.required_balance).toBe(creditCost);
		expect(checkRes.balance).toMatchObject({
			feature_id: TestFeature.Credits,
			granted_balance: 100,
			current_balance: 99,
			usage: 1,
		});

		await timeout(2000);
		const nonCachedCustomer = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{
				skip_cache: "true",
			},
		);

		const nonCachedCreditsBalance =
			nonCachedCustomer.balances[TestFeature.Credits];
		const nonCachedAction1Balance =
			nonCachedCustomer.balances[TestFeature.Action1];
		expect(nonCachedAction1Balance).toMatchObject({
			current_balance: 0,
			usage: 10,
			granted_balance: 10,
		});
		expect(nonCachedCreditsBalance).toMatchObject({
			current_balance: 99,
			usage: 1,
			granted_balance: 100,
		});
	});

	test("should check with track and deduct from action1 first, then credits, v1.2 response", async () => {
		// Refund 5 action 1, 1 credit
		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: -5,
		});

		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: -1,
		});

		const checkRes = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 10,
			send_event: true,
		})) as unknown as CheckResponseV1;

		expect(checkRes).toMatchObject({
			allowed: true,
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			required_balance: getCreditCost({
				featureId: TestFeature.Action1,
				creditSystem: creditFeature!,
				amount: 10,
			}),
			balance: 99,
		});
	});

	test("should check with track and deduct from credits", async () => {
		const value = 2.5;
		const creditCost = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: value,
		});

		const checkRes = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: value,
			send_event: true,
		})) as unknown as CheckResponseV1;

		expect(checkRes).toMatchObject({
			allowed: true,
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			required_balance: creditCost,
			balance: 99 - creditCost,
		});

		// Get non-cached customer
		await timeout(2000);
		const nonCachedCustomer = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		const nonCachedCreditsBalance =
			nonCachedCustomer.balances[TestFeature.Credits];

		expect(nonCachedCreditsBalance).toMatchObject({
			granted_balance: 100,
			current_balance: 99 - creditCost,
			usage: 1 + creditCost,
		});
	});
});
