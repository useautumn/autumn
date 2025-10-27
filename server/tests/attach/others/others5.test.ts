import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features, products } from "tests/global.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
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
	product: any;
	totalAllowance?: number;
	finish?: boolean;
	usageBased?: boolean;
	timeoutMs?: number;
}) => {
	// 1. Send events
	const allowance = totalAllowance || product.entitlements.metered1.allowance;
	// const randomNum = Math.floor(Math.random() * (allowance - 1));
	const randomNum = 3;

	const batchUpdates = [];
	for (let i = 0; i < randomNum; i++) {
		batchUpdates.push(
			AutumnCli.sendEvent({
				customerId: customerId,
				eventName: features.metered1.eventName,
			}),
		);
	}

	await Promise.all(batchUpdates);
	await timeout(timeoutMs);
	let used = randomNum;

	// 2. Check entitled
	const { allowed, balanceObj }: any = await AutumnCli.entitled(
		customerId,
		features.metered1.id,
		true,
	);

	try {
		expect(allowed).toBe(true);
		expect(balanceObj!.balance).toBe(allowance - randomNum);

		if (!finish) {
			return used;
		}
	} catch (error) {
		console.group();
		console.group();
		console.log("Allowance: ", allowance, "Random num: ", randomNum);
		console.log("Expected balance to be: ", allowance - randomNum);
		console.log("Entitled res: ", { allowed, balanceObj });
		console.groupEnd();
		console.groupEnd();
		throw error;
	}

	// Finish up
	const batchUpdates2 = [];
	for (let i = 0; i < allowance - randomNum; i++) {
		batchUpdates2.push(
			AutumnCli.sendEvent({
				customerId: customerId,
				eventName: features.metered1.eventName,
			}),
		);
	}
	await Promise.all(batchUpdates2);
	await timeout(timeoutMs);
	used += allowance - randomNum;

	// 3. Check entitled again
	const { allowed: allowed2, balanceObj: balanceObj2 }: any =
		await AutumnCli.entitled(customerId, features.metered1.id, true);
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
describe(`${chalk.yellowBright(
	"others5: Testing /events and /entitled, for pro, one time top up",
)}`, () => {
	const customerId = testCase;

	let curAllowance = 0;
	const oneTimeBillingUnits =
		products.oneTimeAddOnMetered1.prices[0].config.billing_units!;
	const oneTimeQuantity = 2 * oneTimeBillingUnits;

	beforeAll(async () => {
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
	//     product: products.free,
	//     finish: true,
	//   });
	// });

	test("should attach pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.pro.id,
		});
	});

	test("should have correct entitlements (pro)", async () => {
		const used = await checkEntitledOnProduct({
			customerId: customerId,
			product: products.pro,
			finish: false,
		});

		curAllowance = products.pro.entitlements.metered1.allowance! - used;
	});

	test("should attach one time top up", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.oneTimeAddOnMetered1.id,
			options: [
				{
					feature_id: features.metered1.id,
					quantity: oneTimeQuantity,
				},
			],
		});
	});

	test("should have correct entitlements (one time top up)", async () => {
		// const oneTimeAmt = oneTimeBillingUnits * oneTimeQuantity;

		await checkEntitledOnProduct({
			customerId: customerId,
			product: products.oneTimeAddOnMetered1,
			finish: true,
			totalAllowance: curAllowance + oneTimeQuantity,
			timeoutMs: 15000,
		});
	});
});

describe(`${chalk.yellowBright(
	"others5: Testing /entitled & /events, for pro with overage",
)}`, () => {
	const customerId = testCase;

	beforeAll(async () => {
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
			productId: products.proWithOverage.id,
		});
	});

	test("should have correct entitlements (pro with overage)", async () => {
		await checkEntitledOnProduct({
			customerId: customerId,
			product: products.proWithOverage,
			finish: true,
			totalAllowance: products.proWithOverage.entitlements.metered1.allowance!,
			usageBased: true,
		});
	});

	test("should have correct usage-based balance (balance < 0)", async () => {
		const { allowed, balanceObj }: any = await AutumnCli.entitled(
			customerId,
			features.metered1.id,
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
					eventName: features.metered1.eventName,
				}),
			);
		}

		await Promise.all(batchUpdates);
		await timeout(10000);

		const { allowed: allowed2, balanceObj: balanceObj2 }: any =
			await AutumnCli.entitled(customerId, features.metered1.id, true);

		expect(allowed2).toBe(true);
		expect(balanceObj2!.balance).toBe(-5);
		expect(balanceObj2!.usage_allowed).toBe(true);
	});
});
