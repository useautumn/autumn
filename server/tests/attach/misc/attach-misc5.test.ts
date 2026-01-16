import { beforeAll, describe, expect, test } from "bun:test";
import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { getMainCusProduct } from "@tests/utils/cusProductUtils/cusProductUtils.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "attach-misc5";

const pro = constructProduct({
	id: "pro",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "pro",
});

describe(`${chalk.yellowBright(
	`${testCase}: Testing convert collection method from send_invoice`,
)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async () => {
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
		});
	});

	test("should attach pro product and pay for it", async () => {
		const res = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
			enable_product_immediately: true,
		});

		expect(res.invoice).toBeDefined();

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
		});

		const invoiceStripeId = res.invoice.stripe_id;
		await stripeCli.invoices.finalizeInvoice(invoiceStripeId);

		await stripeCli.invoices.pay(invoiceStripeId);
	});

	test("should have collection method charge automatically", async () => {
		await timeout(5000);

		const cusProduct = await getMainCusProduct({
			db,
			customerId,
			orgId: org.id,
			env,
			productGroup: pro.group ?? undefined,
		});

		const sub = await cusProductToSub({
			cusProduct,
			stripeCli,
		});

		expect(sub?.collection_method ?? undefined).toBe("charge_automatically");
	});
});
