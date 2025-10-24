import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, CusProductStatus } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { timeout } from "@/utils/genUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { sharedDefaultFree, sharedProProduct } from "./sharedProducts.js";

const testCase = "basic3";
const customerId = testCase;

describe(`${chalk.yellowBright("basic3: Testing cancel through Stripe at period end and now")}`, () => {
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

		// Then create customer with payment method
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
			withDefault: true,
		});
	});

	test("should attach pro product", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: sharedProProduct.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		await expectCustomerV0Correct({
			sent: sharedProProduct,
			cusRes: res,
		});
	});

	test("should cancel pro product (at period end)", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);

		const proProduct = cusRes.products.find(
			(p: any) => p.id === sharedProProduct.id,
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
		await expectCustomerV0Correct({
			sent: sharedProProduct,
			cusRes: cusRes,
		});

		const proProduct = cusRes.products.find(
			(p: any) => p.id === sharedProProduct.id,
		);
		expect(proProduct.canceled_at).not.toBe(null);
		expect(proProduct.status).toBe(CusProductStatus.Active);

		const freeProduct = cusRes.products.find(
			(p: any) => p.id === sharedDefaultFree.id,
		);
		expect(freeProduct).toBeDefined();
		expect(freeProduct.status).toBe(CusProductStatus.Scheduled);
	});

	test("should cancel pro product (now)", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);
		const proProduct = cusRes.products.find(
			(p: any) => p.id === sharedProProduct.id,
		);

		for (const subId of proProduct.subscription_ids) {
			await stripeCli.subscriptions.cancel(subId);
		}
		await timeout(5000);
	});

	test("should have free product active, and no pro product", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);
		await expectCustomerV0Correct({
			sent: sharedDefaultFree,
			cusRes: cusRes,
		});
	});
});
