import { expect } from "chai";
import chalk from "chalk";
import { features } from "tests/global.js";
import { setupBefore } from "tests/before.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
	APIVersion,
	AppEnv,
	BillingInterval,
	ProductItemFeatureType,
	UsageModel,
} from "@autumn/shared";
import { createProducts } from "tests/utils/productUtils.js";
import { getMainCusProduct } from "tests/utils/cusProductUtils/cusProductUtils.js";
import { getUsageCusEnt } from "tests/utils/cusProductUtils/cusEntSearchUtils.js";
import { getPrepaidCusEnt } from "tests/utils/cusProductUtils/cusEntSearchUtils.js";
import { constructFeaturePriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

// Scenario 1: prepaid + pay per use monthly -> prepaid + pay per use monthly
let pro = {
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

let premium = {
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
	let mainCusProduct = await getMainCusProduct({
		customerId,
		db,
		orgId,
		env,
	});

	let prepaidCusEnt = getPrepaidCusEnt({
		cusProduct: mainCusProduct!,
		featureId,
	});

	let usageCusEnt = getUsageCusEnt({
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
	let autumn2: AutumnInt = new AutumnInt({ version: APIVersion.v1_2 });
	let customerId = testCase;

	let prepaidQuantity = 10;
	let prepaidAllowance = pro.items.prepaid.included_usage + prepaidQuantity;
	let totalUsage = 0;

	let premiumPrepaidAllowance =
		premium.items.prepaid.included_usage + prepaidQuantity;

	let optionsList = [
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

		let { prepaidCusEnt, usageCusEnt } = await getPrepaidAndUsageCusEnts({
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
		let value = 60;

		await autumn.track({
			customer_id: customerId,
			value,
			feature_id: features.metered1.id,
		});

		totalUsage += value;

		await timeout(3000);

		let { prepaidCusEnt, usageCusEnt } = await getPrepaidAndUsageCusEnts({
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
		let value = 60;
		await autumn.track({
			customer_id: customerId,
			value,
			feature_id: features.metered1.id,
		});

		totalUsage += value;

		await timeout(10000);

		let { usageCusEnt } = await getPrepaidAndUsageCusEnts({
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

		let { prepaidCusEnt, usageCusEnt: newUsageCusEnt } =
			await getPrepaidAndUsageCusEnts({
				customerId,
				db: this.db,
				orgId: this.org.id,
				env: this.env,
				featureId: features.metered1.id,
			});

		// Check invoice too
		let { invoices } = await autumn2.customers.get(customerId);

		let invoice1Amount =
			(premium.items.prepaid.price ?? 0) * prepaidQuantity -
			(pro.items.prepaid.price ?? 0) * prepaidQuantity;

		let invoice0Amount = value * (pro.items.payPerUse.price ?? 0);

		let totalAmount = invoice1Amount + invoice0Amount;

		expect(invoices![0].total).to.equal(totalAmount);

		let leftover = premiumPrepaidAllowance - totalUsage + value;
		expect(prepaidCusEnt?.balance).to.equal(Math.max(0, leftover));
		expect(newUsageCusEnt?.balance).to.equal(0);
	});
});
