import { expect } from "chai";
import chalk from "chalk";
import { AutumnCli } from "../cli/AutumnCli.js";
import { features, products } from "../global.js";
import { timeout } from "../utils/genUtils.js";
import { initCustomer } from "../utils/init.js";

const checkEntitledOnProduct = async ({
	customerId,
	product,
	totalAllowance,
	finish = false,
	usageBased = false,
}: {
	customerId: string;
	product: any;
	totalAllowance?: number;
	finish?: boolean;
	usageBased?: boolean;
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
	await timeout(8000);
	let used = randomNum;

	// 2. Check entitled
	const { allowed, balanceObj }: any = await AutumnCli.entitled(
		customerId,
		features.metered1.id,
		true,
	);

	try {
		expect(allowed).to.be.true;
		expect(balanceObj?.balance).to.equal(allowance - randomNum);

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
	await timeout(8000);
	used += allowance - randomNum;

	// 3. Check entitled again
	const { allowed: allowed2, balanceObj: balanceObj2 }: any =
		await AutumnCli.entitled(customerId, features.metered1.id, true);
	try {
		if (usageBased) {
			expect(allowed2).to.be.true;
		} else {
			expect(allowed2).to.be.false;
		}
		expect(balanceObj2?.balance).to.equal(0);
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

describe(`${chalk.yellowBright(
	"04_entitled: Testing /events and /entitled, for pro, one time top up",
)}`, () => {
	const customerId = "entitledCustomer";

	let curAllowance = 0;
	const oneTimeBillingUnits =
		products.oneTimeAddOnMetered1.prices[0].config.billing_units!;
	const oneTimeQuantity = 2 * oneTimeBillingUnits;

	before(async function () {
		await initCustomer({
			customer_data: {
				id: customerId,
				name: customerId,
				email: `test@test.com`,
			},
			db: this.db,
			org: this.org,
			env: this.env,
			attachPm: true,
		});
	});

	it("should have correct entitlements (free)", async () => {
		await checkEntitledOnProduct({
			customerId: customerId,
			product: products.free,
			finish: true,
		});
	});

	it("should attach pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.pro.id,
		});
	});

	it("should have correct entitlements (pro)", async () => {
		const used = await checkEntitledOnProduct({
			customerId: customerId,
			product: products.pro,
			finish: false,
		});

		curAllowance = products.pro.entitlements.metered1.allowance! - used;
	});

	it("should attach one time top up", async () => {
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

	it("should have correct entitlements (one time top up)", async () => {
		// const oneTimeAmt = oneTimeBillingUnits * oneTimeQuantity;

		await checkEntitledOnProduct({
			customerId: customerId,
			product: products.oneTimeAddOnMetered1,
			finish: true,
			totalAllowance: curAllowance + oneTimeQuantity,
		});
	});
});

describe(`${chalk.yellowBright(
	"04_entitled: Testing /entitled & /events, for pro with overage",
)}`, () => {
	const customerId = "entitledCustomerUsageBased";

	before(async function () {
		await initCustomer({
			customer_data: {
				id: customerId,
				name: customerId,
				email: "test@test.com",
			},
			db: this.db,
			org: this.org,
			env: this.env,
			attachPm: true,
		});
	});

	// PRO WITH OVERAGE
	it("should attach pro (with overage)", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.proWithOverage.id,
		});
	});

	it("should have correct entitlements (pro with overage)", async () => {
		await checkEntitledOnProduct({
			customerId: customerId,
			product: products.proWithOverage,
			finish: true,
			totalAllowance: products.proWithOverage.entitlements.metered1.allowance!,
			usageBased: true,
		});
	});

	it("should have correct usage-based balance (balance < 0)", async () => {
		const { allowed, balanceObj }: any = await AutumnCli.entitled(
			customerId,
			features.metered1.id,
			true,
		);

		expect(allowed).to.be.true;
		expect(balanceObj?.balance).to.equal(0);

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
		await timeout(5000);

		const { allowed: allowed2, balanceObj: balanceObj2 }: any =
			await AutumnCli.entitled(customerId, features.metered1.id, true);

		expect(allowed2).to.be.true;
		expect(balanceObj2?.balance).to.equal(-5);
		expect(balanceObj2?.usage_allowed).to.be.true;
	});
});
