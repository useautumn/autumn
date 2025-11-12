import { beforeAll, describe, expect, test } from "bun:test";
import type { LimitedItem } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { constructArrearItem } from "../../../../src/utils/scriptUtils/constructItem.js";
import { constructProduct } from "../../../../src/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "../../../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../../../src/utils/scriptUtils/testUtils/initProductsV0.js";
import { AutumnCli } from "../../../cli/AutumnCli.js";
import { TestFeature } from "../../../setup/v2Features.js";
import { timeout } from "../../../utils/genUtils.js";
import { checkEntitledOnProduct } from "./trackLegacyUtils.js";

// Pro with overage - matches global products.proWithOverage
const messagesOverageItem = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 10,
	billingUnits: 1,
	price: 0.5,
}) as LimitedItem;
const proWithOverage = constructProduct({
	type: "pro",
	items: [messagesOverageItem],
});

const testCase = "track-legacy2";
describe(`${chalk.yellowBright("track-legacy2: Testing /entitled & /events, for pro with overage")}`, () => {
	const customerId = testCase;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [proWithOverage],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});
	});

	// PRO WITH OVERAGE
	test("should attach pro (with overage)", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: proWithOverage.id,
		});
	});

	test("should have correct entitlements (pro with overage)", async () => {
		const proOverageAllowance = messagesOverageItem.included_usage;

		await checkEntitledOnProduct({
			customerId: customerId,
			product: proWithOverage,
			finish: true,
			totalAllowance: proOverageAllowance,
			usageBased: true,
		});
	});

	test("should have correct usage-based balance (balance < 0)", async () => {
		const { allowed, balanceObj }: any = await AutumnCli.entitled(
			customerId,
			TestFeature.Messages,
			true,
		);

		expect(allowed).toBe(true);
		expect(balanceObj!.balance).toBe(0);

		// Sent 5 events
		const batchUpdates = [];
		for (let i = 0; i < 5; i++) {
			batchUpdates.push(
				AutumnCli.sendEvent({
					customerId: customerId,
					featureId: TestFeature.Messages,
				}),
			);
		}

		await Promise.all(batchUpdates);
		await timeout(10000);

		const { allowed: allowed2, balanceObj: balanceObj2 }: any =
			await AutumnCli.entitled(customerId, TestFeature.Messages, true);

		expect(allowed2).toBe(true);
		expect(balanceObj2!.balance).toBe(-5);
		expect(balanceObj2!.usage_allowed).toBe(true);
	});
});
