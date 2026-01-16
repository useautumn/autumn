import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type AppEnv,
	type CreateProductV2Params,
	type Organization,
	ProductItemInterval,
	ResetInterval,
	type UpdatePlanParams,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { TestFeature } from "../../setup/v2Features.js";

describe(
	chalk.yellowBright("Plan V2 - Advanced UPDATE (Entitlement Remapping)"),
	() => {
		const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
		const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });
		let db: DrizzleCli, org: Organization, env: AppEnv;

		beforeAll(() => {
			db = ctx.db;
			org = ctx.org;
			env = ctx.env;
		});

		test("UPDATE: should match existing entitlement by feature_id (no entitlement_id)", async () => {
			const productId = "update_match_1";
			try {
				await autumnV2.products.delete(productId);
			} catch (_error) {}

			// 1. Create initial product via V1.2 (has entitlement_id in items)
			await autumnV1_2.products.create({
				id: "update_match_1",
				name: "Update Match Test",
				items: [
					{
						feature_id: TestFeature.Messages,
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
				(e) => e.feature_id === TestFeature.Messages,
			)!.id;
			expect(initialEntId).toBeDefined();

			// 2. Update via V2 (NO entitlement_id in features)
			await autumnV2.products.update("update_match_1", {
				features: [
					{
						feature_id: TestFeature.Messages,
						granted_balance: 2000,
						reset: {
							interval: ResetInterval.Month,
						},
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
				(e) => e.feature_id === TestFeature.Messages,
			)!;
			expect(updatedEnt.id).toBe(initialEntId); // Same ID!
			expect(updatedEnt.allowance).toBe(2000); // Updated value
		});

		test("UPDATE: should match entitlement with same feature + interval", async () => {
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
						feature_id: TestFeature.Messages,
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
				(e) => e.feature_id === TestFeature.Messages,
			)!.id;

			// 2. Update via V2 - change granted amount
			await autumnV2.products.update("update_match_2", {
				features: [
					{
						feature_id: TestFeature.Messages,
						granted_balance: 1500,
						reset: {
							interval: ResetInterval.Quarter,
						},
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
				(e) => e.feature_id === TestFeature.Messages,
			)!;
			expect(updatedEnt.id).toBe(initialEntId);
			expect(updatedEnt.allowance).toBe(1500);
		});

		test("UPDATE: should create NEW entitlement when interval changes", async () => {
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
						feature_id: TestFeature.Messages,
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
				(e) => e.feature_id === TestFeature.Messages,
			)!.id;

			// 2. Update to quarterly (different interval)
			await autumnV2.products.update("update_interval_change", {
				features: [
					{
						feature_id: TestFeature.Messages,
						granted_balance: 3000,
						reset: {
							interval: ResetInterval.Quarter,
						},
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
				(e) => e.feature_id === TestFeature.Messages,
			)!;
			expect(updatedEnt.id).not.toBe(initialEntId); // Different ID!
			expect(updatedEnt.allowance).toBe(3000);
		});

		test("UPDATE: should handle multiple features with same feature_id (different intervals)", async () => {
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
						feature_id: TestFeature.Messages,
						included_usage: 1000,
						interval: ProductItemInterval.Month,
					},
					{
						feature_id: TestFeature.Messages,
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
				(e) => e.feature_id === TestFeature.Messages && e.interval === "month",
			)!.id;
			const quarterlyEntId = initialFull.entitlements.find(
				(e) =>
					e.feature_id === TestFeature.Messages && e.interval === "quarter",
			)!.id;

			// Update via V2 - both features
			await autumnV2.products.update("multi_interval", {
				features: [
					{
						feature_id: TestFeature.Messages,
						granted_balance: 1500,
						reset: {
							interval: ResetInterval.Month,
						},
					},
					{
						feature_id: TestFeature.Messages,
						granted_balance: 4500,
						reset: {
							interval: ResetInterval.Quarter,
						},
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
				(e) => e.feature_id === TestFeature.Messages && e.interval === "month",
			)!;
			const quarterlyEnt = updatedFull.entitlements.find(
				(e) =>
					e.feature_id === TestFeature.Messages && e.interval === "quarter",
			)!;

			expect(monthlyEnt.id).toBe(monthlyEntId); // Same ID
			expect(monthlyEnt.allowance).toBe(1500); // Updated value

			expect(quarterlyEnt.id).toBe(quarterlyEntId); // Same ID
			expect(quarterlyEnt.allowance).toBe(4500); // Updated value
		});
	},
);
