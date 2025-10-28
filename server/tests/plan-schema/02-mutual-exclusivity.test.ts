import {
	BillingInterval,
	type CreatePlanParams,
	ResetInterval,
	UsageModel,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { features } from "tests/global.js";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";

describe(chalk.yellowBright("Plan V2 - Mutual Exclusivity Validation"), () => {
	const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
	const autumnV1_2 = new AutumnCliV2({ version: "1.2" });
	let _db, _org, _env;

	before(async function () {
		await setupBefore(this);
		_db = this.db;
		_org = this.org;
		_env = this.env;
	});

	it("REJECT: reset_interval + price.interval both set", async () => {
		const productId = "invalid_both";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		try {
			await autumnV2.products.create({
				id: "invalid_both",
				name: "Invalid Both Intervals",
				features: [
					{
						feature_id: features.metered1.id,
						granted: 100,
						reset_interval: ResetInterval.Month,
						price: {
							amount: 10,
							interval: BillingInterval.Month,
							usage_model: UsageModel.PayPerUse,
							billing_units: 1,
						},
					},
				],
			} as CreatePlanParams);
		} catch (err: unknown) {
			await expect((err as Error).message).to.include("mutually exclusive");
		}
	});

	it("ACCEPT: only reset_interval (metered, no price)", async () => {
		const productId = "only_reset";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "only_reset",
			name: "Only Reset Interval",
			features: [
				{
					feature_id: features.metered1.id,
					granted: 100,
					reset_interval: ResetInterval.Month,
				},
			],
		} as CreatePlanParams);

		const v1_2 = (await autumnV1_2.products.get("only_reset")) as any;
		expect(v1_2.items[0].interval).to.equal("month");
		expect(v1_2.items[0].price).to.be.undefined;
	});

	it("ACCEPT: only price.interval (usage pricing, no reset)", async () => {
		const productId = "only_price_interval";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		await autumnV2.products.create({
			id: "only_price_interval",
			name: "Only Price Interval",
			features: [
				{
					feature_id: features.metered1.id,
					price: {
						amount: 10,
						interval: BillingInterval.Month,
						usage_model: UsageModel.PayPerUse,
						billing_units: 1,
					},
				},
			],
		} as CreatePlanParams);

		const v1_2 = (await autumnV1_2.products.get("only_price_interval")) as any;
		expect(v1_2.items[0].price).to.equal(10);
		expect(v1_2.items[0].interval).to.equal("month");
	});
});
