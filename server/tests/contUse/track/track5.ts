import {
	type AppEnv,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addDays, addHours } from "date-fns";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { defaultApiVersion } from "tests/constants.js";
import { features } from "tests/global.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { getSubsFromCusId } from "tests/utils/expectUtils/expectSubUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import {
	addPrefixToProducts,
	getBasePrice,
} from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const seatsItem = constructArrearProratedItem({
	featureId: features.seats.id,
	pricePerUnit: 20,
	includedUsage: 3,
	config: {
		on_increase: OnIncrease.ProrateNextCycle,
		on_decrease: OnDecrease.ProrateNextCycle,
	},
});

const seatsProduct = constructProduct({
	type: "pro",
	items: [seatsItem],
});

const testCase = "track5";
const includedUsage = seatsItem.included_usage as number;

const simulateOneCycle = async ({
	customerId,
	db,
	org,
	env,
	stripeCli,
	curUnix,
	usageValues,
	autumn,
	testClockId,
}: {
	customerId: string;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	stripeCli: Stripe;
	curUnix: number;
	usageValues: number[];
	autumn: AutumnInt;
	testClockId: string;
}) => {
	const { subs } = await getSubsFromCusId({
		customerId,
		db,
		org,
		env,
		stripeCli,
		productId: seatsProduct.id,
	});

	const sub = subs[0];

	let accruedPrice = 0;
	for (const usageValue of usageValues) {
		const daysToAdvance = Math.round(Math.random() * 10) + 1;
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(curUnix, daysToAdvance).getTime(),
			waitForSeconds: 10,
		});

		const customer = await autumn.customers.get(customerId);
		const prevBalance = customer.features[seatsItem.feature_id!].balance!;
		const prevUsage = includedUsage - prevBalance;

		const usageDiff = usageValue - prevUsage;

		const value1 = Math.floor(usageDiff / 2);
		const value2 = usageDiff - value1;

		await autumn.track({
			customer_id: customerId,
			feature_id: seatsItem.feature_id!,
			value: value1,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: seatsItem.feature_id!,
			value: value2,
		});

		const newBalance = includedUsage - usageValue;
		const prevOverage = Math.max(0, -prevBalance);
		const newOverage = Math.max(0, -newBalance);

		const newPrice = (newOverage - prevOverage) * seatsItem.price!;

		const { start, end } = subToPeriodStartEnd({ sub });
		const proratedPrice = calculateProrationAmount({
			periodStart: start * 1000,
			periodEnd: end * 1000,
			now: curUnix,
			amount: newPrice,
			allowNegative: true,
		});

		accruedPrice = new Decimal(accruedPrice).plus(proratedPrice).toNumber();
	}

	const customer = await autumn.customers.get(customerId);
	const balance = customer.features[seatsItem.feature_id!].balance!;

	const overage = Math.min(0, includedUsage - balance);
	const usagePrice = overage * seatsItem.price!;
	const basePrice = getBasePrice({ product: seatsProduct });

	const totalPrice = new Decimal(accruedPrice)
		.plus(usagePrice)
		.plus(basePrice)
		.toDecimalPlaces(2)
		.toNumber();

	const { start, end } = subToPeriodStartEnd({ sub });
	curUnix = await advanceTestClock({
		stripeCli,
		testClockId,
		advanceTo: addHours(end * 1000, hoursToFinalizeInvoice).getTime(),
		waitForSeconds: 30,
	});

	const cusAfter = await autumn.customers.get(customerId);
	const invoices = cusAfter.invoices;
	const invoice = invoices[0];

	expect(invoice.total).to.approximately(
		totalPrice,
		0.01,
		`Invoice total should be ${totalPrice} +/- 0.01`,
	);

	return {
		curUnix,
	};
};

describe(`${chalk.yellowBright("conUse/track5: Testing update cont use through /usage")}`, () => {
	const customerId = testCase;

	let stripeCli: Stripe;

	let testClockId = "";
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;
	const autumn = new AutumnInt({ version: defaultApiVersion });
	let curUnix = Date.now();

	before(async function () {
		await setupBefore(this);
		org = this.org;
		env = this.env;
		db = this.db;

		const res = await initCustomer({
			customerId,
			org,
			env,
			db,
			autumn: this.autumnJs,
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [seatsProduct],
			prefix: testCase,
		});

		await createProducts({
			products: [seatsProduct],
			orgId: org.id,
			env,
			db,
			autumn,
		});

		testClockId = res.testClockId;

		db = this.db;
		org = this.org;
		env = this.env;
		stripeCli = this.stripeCli;
	});

	it("should attach in arrear prorated seats", async () => {
		await attachAndExpectCorrect({
			customerId,
			product: seatsProduct,
			db,
			org,
			env,
			autumn,
			stripeCli,
		});
	});

	// return;

	it("simulate first cycle and have correct invoice / balance", async () => {
		const res = await simulateOneCycle({
			customerId,
			db,
			org,
			env,
			stripeCli,
			curUnix,
			usageValues: [8, 2],
			autumn,
			testClockId,
		});

		curUnix = res.curUnix;
	});

	it("simulate second cycle and have correct invoice / balance", async () => {
		const res = await simulateOneCycle({
			customerId,
			db,
			org,
			env,
			stripeCli,
			curUnix,
			usageValues: [12, 3],
			autumn,
			testClockId,
		});

		curUnix = res.curUnix;
	});
});
