import {
	type AppEnv,
	BillingInterval,
	LegacyVersion,
	ProductItemFeatureType,
	UsageModel,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { features } from "tests/global.js";
import {
	getPrepaidCusEnt,
	getUsageCusEnt,
} from "tests/utils/cusProductUtils/cusEntSearchUtils.js";
import { getMainCusProduct } from "tests/utils/cusProductUtils/cusProductUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeaturePriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

// Scenario 1: prepaid + pay per use monthly -> prepaid + pay per use monthly
const pro = {
	id: "multiFeature1Pro",
	name: "Multi Feature 1 Pro",
	items: {
		prepaid: constructFeaturePriceItem({
			feature_id: features.metered1.id,
			feature_type: ProductItemFeatureType.SingleUse,
			included_usage: 50,
			price: 10,
			interval: BillingInterval.Month,
			usage_model: UsageModel.Prepaid,
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
	id: "multiFeature1Premium",
	name: "Multi Feature 1 Premium",
	items: {
		// Prepaid
		prepaid: constructFeaturePriceItem({
			feature_id: features.metered1.id,
			feature_type: ProductItemFeatureType.SingleUse,
			included_usage: 100,
			price: 15,
			interval: BillingInterval.Month,
			usage_model: UsageModel.Prepaid,
		}),

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

export const getPrepaidAndUsageCusEnts = async ({
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

	const prepaidCusEnt = getPrepaidCusEnt({
		cusProduct: mainCusProduct!,
		featureId,
	});

	const usageCusEnt = getUsageCusEnt({
		cusProduct: mainCusProduct!,
		featureId,
	});

	return { prepaidCusEnt, usageCusEnt };
};

const testCase = "multiFeature1";
describe(`${chalk.yellowBright(
	"multiFeature1: Testing prepaid + pay per use -> prepaid + pay per use",
)}`, () => {
	let autumn: AutumnInt = new AutumnInt();
	const autumn2: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_2 });
	const customerId = testCase;

	const prepaidQuantity = 10;
	const prepaidAllowance = pro.items.prepaid.included_usage + prepaidQuantity;
	let totalUsage = 0;

	const premiumPrepaidAllowance =
		premium.items.prepaid.included_usage + prepaidQuantity;

	const optionsList = [
		{
			feature_id: features.metered1.id,
			quantity: prepaidQuantity,
		},
	];

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

		await createProducts({
			autumn,
			products: [pro, premium],
			db: this.db,
			orgId: this.org.id,
			env: this.env,
		});
	});

	it("should attach pro product to customer", async function () {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: optionsList,
		});

		const { prepaidCusEnt, usageCusEnt } = await getPrepaidAndUsageCusEnts({
			customerId,
			db: this.db,
			orgId: this.org.id,
			env: this.env,
			featureId: features.metered1.id,
		});

		expect(prepaidCusEnt?.balance).to.equal(
			prepaidQuantity + pro.items.prepaid.included_usage,
		);

		expect(usageCusEnt?.balance).to.equal(pro.items.payPerUse.included_usage);
	});

	it("should use prepaid allowance first", async function () {
		const value = 60;

		await autumn.track({
			customer_id: customerId,
			value,
			feature_id: features.metered1.id,
		});

		totalUsage += value;

		await timeout(3000);

		const { prepaidCusEnt, usageCusEnt } = await getPrepaidAndUsageCusEnts({
			customerId,
			db: this.db,
			orgId: this.org.id,
			env: this.env,
			featureId: features.metered1.id,
		});

		expect(prepaidCusEnt?.balance).to.equal(prepaidAllowance - value);
		expect(usageCusEnt?.balance).to.equal(pro.items.payPerUse.included_usage);
	});

	it("should have correct usage / invoice after upgrade", async function () {
		const value = 60;
		await autumn.track({
			customer_id: customerId,
			value,
			feature_id: features.metered1.id,
		});

		totalUsage += value;

		await timeout(10000);

		const { usageCusEnt } = await getPrepaidAndUsageCusEnts({
			customerId,
			db: this.db,
			orgId: this.org.id,
			env: this.env,
			featureId: features.metered1.id,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
			options: optionsList,
		});

		const { prepaidCusEnt, usageCusEnt: newUsageCusEnt } =
			await getPrepaidAndUsageCusEnts({
				customerId,
				db: this.db,
				orgId: this.org.id,
				env: this.env,
				featureId: features.metered1.id,
			});

		// Check invoice too
		const { invoices } = await autumn2.customers.get(customerId);

		const invoice1Amount =
			(premium.items.prepaid.price ?? 0) * prepaidQuantity -
			(pro.items.prepaid.price ?? 0) * prepaidQuantity;

		const invoice0Amount = value * (pro.items.payPerUse.price ?? 0);

		const totalAmount = invoice1Amount + invoice0Amount;

		expect(invoices![0].total).to.equal(totalAmount);

		const leftover = premiumPrepaidAllowance - totalUsage + value;
		expect(prepaidCusEnt?.balance).to.equal(Math.max(0, leftover));
		expect(newUsageCusEnt?.balance).to.equal(0);
	});
});
