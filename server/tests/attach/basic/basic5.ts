import { CusProductStatus } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { timeout } from "@/utils/genUtils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const testCase = "basic5";
describe(`${chalk.yellowBright(
	"basic5: Testing cancel through Stripe at period end and now",
)}`, () => {
	const customerId = testCase;
	let stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		stripeCli = this.stripeCli;
		await initCustomer({
			customerId,
			db: this.db,
			org: this.org,
			env: this.env,
			autumn: this.autumnJs,
			attachPm: "success",
		});
	});

	it("should attach pro product", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: products.pro.id,
		});
	});

	it("should cancel pro product (at period end)", async function () {
		const stripeCli = createStripeCli({ org: this.org, env: this.env });
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

	it("should have pro product active, and canceled_at != null, and free scheduled", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: products.pro,
			cusRes: cusRes,
		});

		const proProduct = cusRes.products.find(
			(p: any) => p.id === products.pro.id,
		);
		expect(proProduct.canceled_at).to.not.equal(null);
		expect(proProduct.status).to.equal(CusProductStatus.Active);

		const freeProduct = cusRes.products.find(
			(p: any) => p.id === products.free.id,
		);
		expect(freeProduct).to.exist;
		expect(freeProduct.status).to.equal(CusProductStatus.Scheduled);
	});

	it("should cancel pro product (now)", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);
		const proProduct = cusRes.products.find(
			(p: any) => p.id === products.pro.id,
		);

		for (const subId of proProduct.subscription_ids) {
			await stripeCli.subscriptions.cancel(subId);
		}
		await timeout(5000);
	});

	it("should have free product active, and no pro product", async () => {
		const cusRes: any = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: products.free,
			cusRes: cusRes,
		});
	});
});
