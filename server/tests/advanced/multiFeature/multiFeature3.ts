/** biome-ignore-all lint/suspicious/noExportsInTest: needed */
import {
	type AppEnv,
	BillingInterval,
	EntInterval,
	ProductItemFeatureType,
	UsageModel,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { setupBefore } from "tests/before.js";
import { features } from "tests/global.js";
import {
	getLifetimeFreeCusEnt,
	getUsageCusEnt,
} from "tests/utils/cusProductUtils/cusEntSearchUtils.js";
import { getMainCusProduct } from "tests/utils/cusProductUtils/cusProductUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructFeaturePriceItem,
} from "@/internal/products/product-items/productItemUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { initCustomerV2 } from "@/utils/scriptUtils/initCustomer.js";

// Scenario 1: prepaid + pay per use monthly -> prepaid + pay per use monthly
const pro = {
	id: "multiFeature3Pro",
	name: "Multi Feature 3 Pro",
	items: {
		lifetime: constructFeatureItem({
			feature_id: features.metered1.id,
			included_usage: 50,
			interval: EntInterval.Lifetime,
		}),
		payPerUse: constructFeaturePriceItem({
			feature_id: features.metered1.id,
			feature_type: ProductItemFeatureType.SingleUse,
			included_usage: 0,
			price: 0.5,
			interval: BillingInterval.Month,
			usage_model: UsageModel.PayPerUse,
		}),
	},
};

export const getLifetimeAndUsageCusEnts = async ({
	customerId,
	db,
	orgId,
	env,
	featureId,
}: {
	customerId: string;
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	featureId: string;
}) => {
	const mainCusProduct = await getMainCusProduct({
		customerId,
		db,
		orgId,
		env,
	});

	const lifetimeCusEnt = getLifetimeFreeCusEnt({
		cusProduct: mainCusProduct!,
		featureId,
	});

	const usageCusEnt = getUsageCusEnt({
		cusProduct: mainCusProduct!,
		featureId,
	});

	return { lifetimeCusEnt, usageCusEnt };
};

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
	"multi-feature/multi_feature3: Testing lifetime + pay per use, advance test clock",
)}`, () => {
	const autumn: AutumnInt = new AutumnInt();
	const customerId = "multiFeature3Customer";

	let totalUsage = 0;

	let testClockId: string;
	before(async function () {
		await setupBefore(this);

		const res = await initCustomerV2({
			autumn,
			customerId,
			db: this.db,
			org: this.org,
			env: this.env,
			attachPm: "success",
		});

		testClockId = res.testClockId;

		await createProducts({
			autumn,
			products: [pro],
			db: this.db,
			orgId: this.org.id,
			env: this.env,
		});
	});

	it("should attach pro product to customer", async function () {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const { lifetimeCusEnt, usageCusEnt } = await getLifetimeAndUsageCusEnts({
			customerId,
			db: this.db,
			orgId: this.org.id,
			env: this.env,
			featureId: features.metered1.id,
		});

		expect(lifetimeCusEnt?.balance).to.equal(pro.items.lifetime.included_usage);

		expect(usageCusEnt?.balance).to.equal(pro.items.payPerUse.included_usage);
	});

	const overageValue = 30;
	it("should use lifetime allowance + overage", async function () {
		let value = pro.items.lifetime.included_usage as number;
		value += overageValue;

		await autumn.track({
			customer_id: customerId,
			value,
			feature_id: features.metered1.id,
		});

		totalUsage += value;

		await timeout(3000);

		const { lifetimeCusEnt, usageCusEnt } = await getLifetimeAndUsageCusEnts({
			customerId,
			db: this.db,
			orgId: this.org.id,
			env: this.env,
			featureId: features.metered1.id,
		});

		expect(lifetimeCusEnt?.balance).to.equal(0);
		expect(usageCusEnt?.balance).to.equal(-overageValue);
	});

	it("cycle 1:should have correct usage after first cycle", async function () {
		const advanceTo = addMonths(new Date(), 1).getTime();
		await advanceTestClock({
			stripeCli: this.stripeCli,
			testClockId,
			advanceTo,
		});

		const { lifetimeCusEnt, usageCusEnt } = await getLifetimeAndUsageCusEnts({
			customerId,
			db: this.db,
			orgId: this.org.id,
			env: this.env,
			featureId: features.metered1.id,
		});

		expect(lifetimeCusEnt?.balance).to.equal(0);
		expect(usageCusEnt?.balance).to.equal(0);
	});
});
