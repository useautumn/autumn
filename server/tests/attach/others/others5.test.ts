import { beforeAll, describe, expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import { ProductItemInterval } from "@autumn/shared";
import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../utils/genUtils.js";

const checkEntitledOnProduct = async ({
	customerId,
	product,
	totalAllowance,
	finish = false,
	usageBased = false,
	timeoutMs = 8000,
}: {
	customerId: string;
	product: ProductV2;
	totalAllowance?: number;
	finish?: boolean;
	usageBased?: boolean;
	timeoutMs?: number;
}) => {
	// Get allowance from ProductV2 - find the feature item for Messages
	const messagesItem = product.items.find(
		(item) => item.feature_id === TestFeature.Messages,
	);
	const allowance =
		totalAllowance ||
		(messagesItem?.included_usage &&
		typeof messagesItem.included_usage === "number"
			? messagesItem.included_usage
			: 0);

	// const randomNum = Math.floor(Math.random() * (allowance - 1));
	const randomNum = 3;

	const batchUpdates = [];
	for (let i = 0; i < randomNum; i++) {
		batchUpdates.push(
			AutumnCli.sendEvent({
				customerId: customerId,
				featureId: TestFeature.Messages,
			}),
		);
	}

	await Promise.all(batchUpdates);
	await timeout(timeoutMs);
	let used = randomNum;

	// 2. Check entitled
	const { allowed, balanceObj }: any = await AutumnCli.entitled(
		customerId,
		TestFeature.Messages,
		true,
	);

	expect(allowed).toBe(true);
	expect(
		balanceObj!.balance,
		`balance for messages should be ${allowance - randomNum}, but got ${balanceObj!.balance}`,
	).toBe(allowance - randomNum);

	if (!finish) return used;

	// Finish up
	const batchUpdates2 = [];
	for (let i = 0; i < allowance - randomNum; i++) {
		batchUpdates2.push(
			AutumnCli.sendEvent({
				customerId: customerId,
				featureId: TestFeature.Messages,
			}),
		);
	}
	await Promise.all(batchUpdates2);
	await timeout(timeoutMs);
	used += allowance - randomNum;

	// 3. Check entitled again
	const { allowed: allowed2, balanceObj: balanceObj2 }: any =
		await AutumnCli.entitled(customerId, TestFeature.Messages, true);
	try {
		if (usageBased) {
			expect(allowed2).toBe(true);
		} else {
			expect(allowed2).toBe(false);
		}
		expect(balanceObj2!.balance).toBe(0);
		return used;
	} catch (error) {
		console.group();
		console.group();
		console.log("Expected balance to be: ", 0);
		console.log("Entitled res: ", { allowed2, balanceObj2 });
		console.groupEnd();
		console.groupEnd();
		throw error;
	}
};

// TODO: Add test case for unlimited feature

const testCase = "others5";

// Pro product - matches global products.pro
const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Dashboard,
			isBoolean: true,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		constructFeatureItem({
			featureId: TestFeature.Admin,
			unlimited: true,
		}),
	],
});

// One-time add-on product - matches global products.oneTimeAddOnMetered1
const oneTimeAddOnMetered1 = constructRawProduct({
	id: "one-time-add-on-metered-1",
	isAddOn: true,
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			isOneOff: true,
			billingUnits: 100,
			includedUsage: 0,
		}),
	],
});

describe.skip(`${chalk.yellowBright(
	"others5: Testing /events and /entitled, for pro, one time top up",
)}`, () => {
	const customerId = testCase;

	let curAllowance = 0;
	const oneTimeBillingUnits = 100; // From oneTimeAddOnMetered1 prepaid item
	const oneTimeQuantity = 2 * oneTimeBillingUnits;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, oneTimeAddOnMetered1],
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

	// test("should have correct entitlements (free)", async function () {
	//   await checkEntitledOnProduct({
	//     customerId: customerId,
	//     product: free,
	//     finish: true,
	//   });
	// });

	test("should attach pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: pro.id,
		});
	});

	test("should have correct entitlements (pro)", async () => {
		const used = await checkEntitledOnProduct({
			customerId: customerId,
			product: pro,
			finish: false,
		});

		const messagesItem = pro.items.find(
			(item) => item.feature_id === TestFeature.Messages,
		);
		const proAllowance =
			messagesItem?.included_usage &&
			typeof messagesItem.included_usage === "number"
				? messagesItem.included_usage
				: 0;
		curAllowance = proAllowance - used;
	});

	test("should attach one time top up", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: oneTimeAddOnMetered1.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: oneTimeQuantity,
				},
			],
		});
	});

	test("should have correct entitlements (one time top up)", async () => {
		// const oneTimeAmt = oneTimeBillingUnits * oneTimeQuantity;

		await checkEntitledOnProduct({
			customerId: customerId,
			product: oneTimeAddOnMetered1,
			finish: true,
			totalAllowance: curAllowance + oneTimeQuantity,
			timeoutMs: 15000,
		});
	});
});
