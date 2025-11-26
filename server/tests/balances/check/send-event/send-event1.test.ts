import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../../utils/genUtils.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "free",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Workflows,
			includedUsage: 5,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 200,
		}),
	],
});

describe(`${chalk.yellowBright("send-event1: Testing send event")}`, () => {
	const customerId = "send-event1";
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

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

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	test("should check with track for allocated feature", async () => {
		const res = await Promise.all(
			Array.from({ length: 7 }, () =>
				autumn.check({
					customer_id: customerId,
					feature_id: TestFeature.Workflows,
					send_event: true,
				}),
			),
		);

		const allowedCount = res.filter((r) => r.allowed).length;
		const deniedCount = res.filter((r) => !r.allowed).length;
		expect(allowedCount).toBe(5);
		expect(deniedCount).toBe(2);

		const final = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Workflows,
			send_event: true,
		});

		expect(final.allowed).toBe(false);
		expect(final.balance).toMatchObject({
			granted_balance: 5,
			current_balance: 0,
			usage: 5,
		});
	});

	test("should check with track for consumable feature", async () => {
		const res = await Promise.all(
			Array.from({ length: 150 }, () =>
				autumn.check({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					send_event: true,
					required_balance: 2,
				}),
			),
		);

		const allowedCount = res.filter((r) => r.allowed).length;
		const deniedCount = res.filter((r) => !r.allowed).length;
		expect(allowedCount).toBe(100);
		expect(deniedCount).toBe(50);

		const final = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			send_event: true,
			required_balance: 2,
		});

		expect(final.allowed).toBe(false);
		expect(final.balance).toMatchObject({
			granted_balance: 200,
			current_balance: 0,
			usage: 200,
		});
	});

	test("should have correct non-cached customer balance", async () => {
		await timeout(2000);
		const customer = await autumn.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});

		const messagesBalance = customer.balances[TestFeature.Messages];
		expect(messagesBalance).toMatchObject({
			granted_balance: 200,
			current_balance: 0,
			usage: 200,
		});
		const workflowsBalance = customer.balances[TestFeature.Workflows];
		expect(workflowsBalance).toMatchObject({
			granted_balance: 5,
			current_balance: 0,
			usage: 5,
		});
	});
});
