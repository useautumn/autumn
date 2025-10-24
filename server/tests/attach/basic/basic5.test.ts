import { beforeAll, describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { timeout } from "@/utils/genUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

const testCase = "basic5";

describe(`${chalk.yellowBright("basic5: Testing cancel through Stripe at period end and now")}`, () => {
	const customerId = testCase;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should attach pro product", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.pro.id,
		});
	});

	test("should cancel pro product (at period end)", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);

		const proProduct = cusRes.products.find(
			(p: any) => p.id === products.pro.id,
		);

		for (const subId of proProduct.subscription_ids) {
			await stripeCli.subscriptions.update(subId, {
				cancel_at_period_end: true,
			});
		}
		await timeout(5000);
	});

	test("should have pro product active, and canceled_at != null, and free scheduled", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: products.pro,
			cusRes: cusRes,
		});

		const proProduct = cusRes.products.find(
			(p: any) => p.id === products.pro.id,
		);
		expect(proProduct.canceled_at).not.toBe(null);
		expect(proProduct.status).toBe(CusProductStatus.Active);

		const freeProduct = cusRes.products.find(
			(p: any) => p.id === products.free.id,
		);
		expect(freeProduct).toBeDefined();
		expect(freeProduct.status).toBe(CusProductStatus.Scheduled);
	});

	test("should cancel pro product (now)", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);
		const proProduct = cusRes.products.find(
			(p: any) => p.id === products.pro.id,
		);

		for (const subId of proProduct.subscription_ids) {
			await stripeCli.subscriptions.cancel(subId);
		}
		await timeout(5000);
	});

	test("should have free product active, and no pro product", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: products.free,
			cusRes: cusRes,
		});
	});
});
