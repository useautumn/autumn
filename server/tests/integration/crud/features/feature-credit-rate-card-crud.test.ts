import { expect, test } from "bun:test";
import { ApiVersion, FeatureType } from "@autumn/shared";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const uniqueId = (prefix: string) =>
	`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

test.concurrent(
	`${chalk.yellowBright("feature-rpc: credit rate-card CRUD + V2.3 compatibility")}`,
	async () => {
		const autumn = new AutumnInt({ version: ApiVersion.V2_4 });
		const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });
		const flatFeatureId = uniqueId("rate_flat");
		const tieredFeatureId = uniqueId("rate_tiered");
		const creditFeatureId = uniqueId("rate_credits");

		for (const featureId of [flatFeatureId, tieredFeatureId]) {
			await autumn.post("/features.create", {
				feature_id: featureId,
				name: featureId,
				type: FeatureType.Metered,
				consumable: true,
			});
		}

		const created = await autumn.post("/features.create", {
			feature_id: creditFeatureId,
			name: "Enterprise credits",
			type: FeatureType.CreditSystem,
			invoice_credit: true,
			credit_schema: [
				{
					metered_feature_id: flatFeatureId,
					billing_units: 100,
					credit_cost: 1,
				},
				{
					metered_feature_id: tieredFeatureId,
					billing_units: 1_000,
					tier_behavior: "graduated",
					tiers: [
						{ to: 10_000, credit_cost: 1 },
						{ to: "inf", credit_cost: 0.5 },
					],
				},
			],
		});

		expect(created).toMatchObject({
			id: creditFeatureId,
			invoice_credit: true,
			credit_schema: [
				{
					metered_feature_id: flatFeatureId,
					billing_units: 100,
					credit_cost: 1,
				},
				{
					metered_feature_id: tieredFeatureId,
					billing_units: 1_000,
					tier_behavior: "graduated",
					tiers: [
						{ to: 10_000, credit_cost: 1 },
						{ to: "inf", credit_cost: 0.5 },
					],
				},
			],
		});

		const listed = await autumn.post("/features.list", {});
		expect(
			listed.list.find(
				(feature: { id: string }) => feature.id === creditFeatureId,
			),
		).toMatchObject({ invoice_credit: true });

		const legacyUpdated = await autumnV2_3.post("/features.update", {
			feature_id: creditFeatureId,
			name: "Enterprise credits renamed",
		});
		expect(legacyUpdated.name).toBe("Enterprise credits renamed");
		expect(legacyUpdated).not.toHaveProperty("invoice_credit");
		expect(legacyUpdated).not.toHaveProperty("credit_schema");

		const afterLegacyUpdate = await autumn.post("/features.get", {
			feature_id: creditFeatureId,
		});
		expect(afterLegacyUpdate).toMatchObject({
			name: "Enterprise credits renamed",
			invoice_credit: true,
		});
		expect(afterLegacyUpdate.credit_schema[1].tiers[1].credit_cost).toBe(0.5);

		const updated = await autumn.post("/features.update", {
			feature_id: creditFeatureId,
			invoice_credit: false,
			credit_schema: [
				{
					metered_feature_id: flatFeatureId,
					billing_units: 100,
					credit_cost: 1,
				},
				{
					metered_feature_id: tieredFeatureId,
					billing_units: 1_000,
					tier_behavior: "graduated",
					tiers: [
						{ to: 20_000, credit_cost: 1 },
						{ to: "inf", credit_cost: 0.4 },
					],
				},
			],
		});
		expect(updated.invoice_credit).toBe(false);
		expect(updated.credit_schema[1].tiers).toEqual([
			{ to: 20_000, credit_cost: 1 },
			{ to: "inf", credit_cost: 0.4 },
		]);

		await autumn.post("/features.delete", { feature_id: creditFeatureId });
		for (const featureId of [flatFeatureId, tieredFeatureId]) {
			await autumn.post("/features.delete", { feature_id: featureId });
		}
	},
);
