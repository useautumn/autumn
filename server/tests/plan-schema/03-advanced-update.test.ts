import {
	type AppEnv,
	type CreateProductV2Params,
	type Organization,
	ProductItemInterval,
	ResetInterval,
	type UpdatePlanParams,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { features } from "tests/global.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";
import { ProductService } from "@/internal/products/ProductService.js";

describe(
	chalk.yellowBright("Plan V2 - Advanced UPDATE (Entitlement Remapping)"),
	() => {
		const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
		const autumnV1_2 = new AutumnCliV2({ version: "1.2.0" });
		let db: DrizzleCli, org: Organization, env: AppEnv;

		before(async function () {
			await setupBefore(this);
			db = this.db;
			org = this.org;
			env = this.env;
		});

		it("UPDATE: should match existing entitlement by feature_id (no entitlement_id)", async () => {
			const productId = "update_match_1";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			// 1. Create initial product via V1.2 (has entitlement_id in items)
			const x = await autumnV1_2.products.create({
				id: "update_match_1",
				name: "Update Match Test",
				items: [
					{
						feature_id: features.metered1.id,
						included_usage: 1000,
						interval: ProductItemInterval.Month,
					},
				],
			} as CreateProductV2Params);

			// Get internal entitlement ID using ProductService
			const initialFull = await ProductService.getFull({
				db,
				idOrInternalId: "update_match_1",
				orgId: org.id,
				env,
			});
			const initialEntId = initialFull.entitlements.find(
				(e) => e.feature_id === features.metered1.id,
			)!.id;
			expect(initialEntId).to.exist;

			// 2. Update via V2 (NO entitlement_id in features)
			await autumnV2.products.update("update_match_1", {
				features: [
					{
						feature_id: features.metered1.id,
						granted: 2000,
						reset_interval: ResetInterval.Month,
					},
				],
			} as UpdatePlanParams);

			// 3. Verify entitlement was UPDATED (not created new)
			const updatedFull = await ProductService.getFull({
				db,
				idOrInternalId: "update_match_1",
				orgId: org.id,
				env,
			});
			const updatedEnt = updatedFull.entitlements.find(
				(e) => e.feature_id === features.metered1.id,
			)!;
			expect(updatedEnt.id).to.equal(initialEntId); // Same ID!
			expect(updatedEnt.allowance).to.equal(2000); // Updated value
		});

		it("UPDATE: should match entitlement with same feature + interval", async () => {
			const productId = "update_match_2";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			// 1. Create product with quarterly feature
			await autumnV1_2.products.create({
				id: "update_match_2",
				name: "Quarterly Match Test",
				items: [
					{
						feature_id: features.metered1.id,
						included_usage: 500,
						interval: ProductItemInterval.Quarter,
					},
				],
			} as CreateProductV2Params);

			const initialFull = await ProductService.getFull({
				db,
				idOrInternalId: "update_match_2",
				orgId: org.id,
				env,
			});
			const initialEntId = initialFull.entitlements.find(
				(e) => e.feature_id === features.metered1.id,
			)!.id;

			// 2. Update via V2 - change granted amount
			await autumnV2.products.update("update_match_2", {
				features: [
					{
						feature_id: features.metered1.id,
						granted: 1500,
						reset_interval: ResetInterval.Quarter,
					},
				],
			} as UpdatePlanParams);

			// 3. Verify same entitlement updated
			const updatedFull = await ProductService.getFull({
				db,
				idOrInternalId: "update_match_2",
				orgId: org.id,
				env,
			});
			const updatedEnt = updatedFull.entitlements.find(
				(e) => e.feature_id === features.metered1.id,
			)!;
			expect(updatedEnt.id).to.equal(initialEntId);
			expect(updatedEnt.allowance).to.equal(1500);
		});

		it("UPDATE: should create NEW entitlement when interval changes", async () => {
			const productId = "update_interval_change";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			// 1. Create monthly feature
			await autumnV1_2.products.create({
				id: "update_interval_change",
				name: "Interval Change Test",
				items: [
					{
						feature_id: features.metered1.id,
						included_usage: 1000,
						interval: ProductItemInterval.Month,
					},
				],
			} as CreateProductV2Params);

			const initialFull = await ProductService.getFull({
				db,
				idOrInternalId: "update_interval_change",
				orgId: org.id,
				env,
			});
			const initialEntId = initialFull.entitlements.find(
				(e) => e.feature_id === features.metered1.id,
			)!.id;

			// 2. Update to quarterly (different interval)
			await autumnV2.products.update("update_interval_change", {
				features: [
					{
						feature_id: features.metered1.id,
						granted: 3000,
						reset_interval: ResetInterval.Quarter,
					},
				],
			} as UpdatePlanParams);

			// 3. Verify NEW entitlement created (different ID)
			const updatedFull = await ProductService.getFull({
				db,
				idOrInternalId: "update_interval_change",
				orgId: org.id,
				env,
			});
			const updatedEnt = updatedFull.entitlements.find(
				(e) => e.feature_id === features.metered1.id,
			)!;
			expect(updatedEnt.id).to.not.equal(initialEntId); // Different ID!
			expect(updatedEnt.allowance).to.equal(3000);
		});

		it("UPDATE: should handle multiple features with same feature_id (different intervals)", async () => {
			const productId = "multi_interval";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			// Edge case: Product has same feature with different intervals
			await autumnV1_2.products.create({
				id: "multi_interval",
				name: "Multi Interval Test",
				items: [
					{
						feature_id: features.metered1.id,
						included_usage: 1000,
						interval: ProductItemInterval.Month,
					},
					{
						feature_id: features.metered1.id,
						included_usage: 3000,
						interval: ProductItemInterval.Quarter,
					},
				],
			} as CreateProductV2Params);

			const initialFull = await ProductService.getFull({
				db,
				idOrInternalId: "multi_interval",
				orgId: org.id,
				env,
			});
			const monthlyEntId = initialFull.entitlements.find(
				(e) => e.feature_id === features.metered1.id && e.interval === "month",
			)!.id;
			const quarterlyEntId = initialFull.entitlements.find(
				(e) =>
					e.feature_id === features.metered1.id && e.interval === "quarter",
			)!.id;

			// Update via V2 - both features
			await autumnV2.products.update("multi_interval", {
				features: [
					{
						feature_id: features.metered1.id,
						granted: 1500,
						reset_interval: ResetInterval.Month,
					},
					{
						feature_id: features.metered1.id,
						granted: 4500,
						reset_interval: ResetInterval.Quarter,
					},
				],
			} as UpdatePlanParams);

			// Verify correct entitlements updated
			const updatedFull = await ProductService.getFull({
				db,
				idOrInternalId: "multi_interval",
				orgId: org.id,
				env,
			});
			const monthlyEnt = updatedFull.entitlements.find(
				(e) => e.feature_id === features.metered1.id && e.interval === "month",
			)!;
			const quarterlyEnt = updatedFull.entitlements.find(
				(e) =>
					e.feature_id === features.metered1.id && e.interval === "quarter",
			)!;

			expect(monthlyEnt.id).to.equal(monthlyEntId); // Same ID
			expect(monthlyEnt.allowance).to.equal(1500); // Updated value

			expect(quarterlyEnt.id).to.equal(quarterlyEntId); // Same ID
			expect(quarterlyEnt.allowance).to.equal(4500); // Updated value
		});
	},
);
