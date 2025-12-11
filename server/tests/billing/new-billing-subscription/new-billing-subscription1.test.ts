import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	ApiVersion,
	BillingInterval,
	getCusStripeSubCount,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectProductAttached } from "../../utils/expectUtils/expectProductAttached";

const paidAddOn = constructRawProduct({
	id: "addOn",
	isAddOn: true,
	items: [
		constructPriceItem({
			price: 10,
			interval: BillingInterval.Month,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 500,
		}),
	],
});

const pro = constructProduct({
	type: "pro",

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 300,
		}),
	],
});

const testCase = "new-billing-subscription1";

describe(`${chalk.yellowBright("new-billing-subscription: paid product with add on mid cycle. add on should create new sub")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		const result = await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro, paidAddOn],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: result.testClockId,
			advanceTo: addWeeks(new Date(), 2).getTime(),
			waitForSeconds: 20,
		});
	});

	test("should attach add on and have correct sub", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: paidAddOn.id,
			new_billing_subscription: true,
		});

		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const subCount = getCusStripeSubCount({
			fullCus,
		});

		expect(subCount).toBe(2);

		const customer = await autumnV1.customers.get(customerId);

		expectProductAttached({
			customer: customer,
			product: paidAddOn,
		});

		const invoices = customer.invoices;
		expect(invoices.length).toBe(2);
		expect(invoices[0].total).toBe(10);
	});

	test("should attach add on again and have 3 subscriptions", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: paidAddOn.id,
			new_billing_subscription: true,
		});

		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const subCount = getCusStripeSubCount({
			fullCus,
		});

		expect(subCount).toBe(3);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const addOnProduct = customer.products.find((p) => p.id === paidAddOn.id);
		expect(addOnProduct?.quantity).toBe(2);

		const invoices = customer.invoices;
		expect(invoices?.length).toBe(3);
		expect(invoices?.[0].total).toBe(10);
	});
});
