import {
	type AppEnv,
	BillingInterval,
	EntInterval,
	LegacyVersion,
	ProductItemFeatureType,
	UsageModel,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { features } from "tests/global.js";
import {
	getLifetimeFreeCusEnt,
	getUsageCusEnt,
} from "tests/utils/cusProductUtils/cusEntSearchUtils.js";
import { getMainCusProduct } from "tests/utils/cusProductUtils/cusProductUtils.js";
import { createProduct } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructFeaturePriceItem,
} from "@/internal/products/product-items/productItemUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

// Scenario 1: prepaid + pay per use monthly -> prepaid + pay per use monthly
const pro = {
	id: "multiFeature2Pro",
	name: "Multi Feature 2 Pro",
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

const premium = {
	id: "multiFeature2Premium",
	name: "Multi Feature 2 Premium",
	items: {
		// Pay per use
		payPerUse: constructFeaturePriceItem({
			feature_id: features.metered1.id,
			feature_type: ProductItemFeatureType.SingleUse,
			included_usage: 0,
			price: 1,
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
		customerId: customerId,
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

const testCase = "multiFeature2";
describe(`${chalk.yellowBright(
	"multiFeature2: Testing lifetime + pay per use -> pay per use",
)}`, () => {
	let autumn: AutumnInt = new AutumnInt();
	const autumn2: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_2 });
	const customerId = testCase;

	let totalUsage = 0;

	before(async function () {
		await setupBefore(this);

		await initCustomer({
			autumn: this.autumnJs,
			customerId,
			db: this.db,
			org: this.org,
			env: this.env,
			attachPm: "success",
		});

		autumn = this.autumn;

		await createProduct({
			autumn,
			product: pro,
			db: this.db,
			orgId: this.org.id,
			env: this.env,
		});

		await createProduct({
			autumn,
			product: premium,
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

	it("should use lifetime allowance first", async function () {
		const value = pro.items.lifetime.included_usage as number;

		await autumn.events.send({
			customerId,
			value,
			featureId: features.metered1.id,
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

		expect(lifetimeCusEnt?.balance).to.equal(
			(pro.items.lifetime.included_usage as number) - value,
		);
		expect(usageCusEnt?.balance).to.equal(pro.items.payPerUse.included_usage);
	});

	it("should have correct usage after upgrade", async function () {
		const value = 20;

		await autumn.track({
			customer_id: customerId,
			value,
			feature_id: features.metered1.id,
		});

		await timeout(3000);

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		// return;
		const { lifetimeCusEnt, usageCusEnt: newUsageCusEnt } =
			await getLifetimeAndUsageCusEnts({
				customerId,
				db: this.db,
				orgId: this.org.id,
				env: this.env,
				featureId: features.metered1.id,
			});

		expect(lifetimeCusEnt).to.not.exist;
		expect(newUsageCusEnt?.balance).to.equal(-50);

		// Check invoice too
		const res = await autumn2.customers.get(customerId);
		const invoices = res.invoices;

		const invoice0Amount = value * (pro.items.payPerUse.price ?? 0);
		expect(invoices![0].total).to.equal(
			invoice0Amount,
			"Invoice 0 should be 0",
		);
	});
});
