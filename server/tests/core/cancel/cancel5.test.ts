import { beforeAll, describe, expect, it } from "bun:test";
import {
	CusProductStatus,
	LegacyVersion,
	ProductItemInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const freeProd = constructProduct({
	type: "free",
	isDefault: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 5,
			interval: ProductItemInterval.Month,
		}),
	],
});

const proProd = constructProduct({
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

const testCase = "cancel5";
describe(`${chalk.yellowBright("cancel5: Testing cancel for trial products")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [freeProd, proProd],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
			withDefault: true,
		});

		stripeCli = ctx.stripeCli;
	});

	it("should attach pro", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: proProd.id,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: proProd,
		});
	});

	let sub: Stripe.Subscription | undefined;

	it("should cancel pro product through stripe CLI", async () => {
		const fullCus = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		sub = await cusProductToSub({
			cusProduct: fullCus.customer_products?.[0],
			stripeCli,
		});

		await stripeCli.subscriptions.update(sub!.id, {
			cancel_at_period_end: true,
		});

		await timeout(4000);

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: proProd,
			isCanceled: true,
		});

		expectProductAttached({
			customer,
			product: freeProd,
			status: CusProductStatus.Scheduled,
		});
	});

	it("should renew pro produce through stripe CLI and have it update correctly", async () => {
		await stripeCli.subscriptions.update(sub!.id, {
			cancel_at_period_end: false,
		});

		await timeout(4000);

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: proProd,
			status: CusProductStatus.Active,
		});

		expect(customer.products.length).toBe(1);
	});
});
