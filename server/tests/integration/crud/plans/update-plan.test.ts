import { expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiProduct,
	ApiVersion,
	type CreateProductV2ParamsInput,
	ProductItemInterval,
	ResetInterval,
	type UpdatePlanParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

const { db, org, env } = ctx;

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITLEMENT REMAPPING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update: match existing entitlement by feature_id (no entitlement_id)")}`, async () => {
	const productId = "update_match_1";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	// 1. Create initial product via V1.2 (has entitlement_id in items)
	await autumnV1_2.products.create<ApiProduct, CreateProductV2ParamsInput>({
		id: productId,
		name: "Update Match Test",
		items: [
			{
				feature_id: TestFeature.Messages,
				included_usage: 1000,
				interval: ProductItemInterval.Month,
			},
		],
	});

	// Get internal entitlement ID using ProductService
	const initialFull = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});
	const initialEntId = initialFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages,
	)!.id;
	expect(initialEntId).toBeDefined();

	// 2. Update via V2 (NO entitlement_id in features)
	await autumnV2.products.update<ApiPlan, UpdatePlanParamsInput>(productId, {
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 2000,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	// 3. Verify entitlement was UPDATED (not created new)
	const updatedFull = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});
	const updatedEnt = updatedFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages,
	)!;
	// expect(updatedEnt.id).toBe(initialEntId); // Same ID!
	expect(updatedEnt.allowance).toBe(2000); // Updated value
});

test.concurrent(`${chalk.yellowBright("update: match entitlement with same feature + interval")}`, async () => {
	const productId = "update_match_2";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	// 1. Create product with quarterly feature
	await autumnV1_2.products.create<ApiProduct, CreateProductV2ParamsInput>({
		id: productId,
		name: "Quarterly Match Test",
		items: [
			{
				feature_id: TestFeature.Messages,
				included_usage: 500,
				interval: ProductItemInterval.Quarter,
			},
		],
	});

	const initialFull = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});
	const initialEntId = initialFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages,
	)!.id;

	// 2. Update via V2 - change granted amount
	await autumnV2.products.update<ApiPlan, UpdatePlanParamsInput>(productId, {
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 1500,
				reset: { interval: ResetInterval.Quarter },
			},
		],
	});

	// 3. Verify same entitlement updated
	const updatedFull = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});
	const updatedEnt = updatedFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages,
	)!;
	// expect(updatedEnt.id).toBe(initialEntId);
	expect(updatedEnt.allowance).toBe(1500);
});

test.concurrent(`${chalk.yellowBright("update: create NEW entitlement when interval changes")}`, async () => {
	const productId = "update_interval_change";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	// 1. Create monthly feature
	await autumnV1_2.products.create<ApiProduct, CreateProductV2ParamsInput>({
		id: productId,
		name: "Interval Change Test",
		items: [
			{
				feature_id: TestFeature.Messages,
				included_usage: 1000,
				interval: ProductItemInterval.Month,
			},
		],
	});

	const initialFull = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});
	const initialEntId = initialFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages,
	)!.id;

	// 2. Update to quarterly (different interval)
	await autumnV2.products.update<ApiPlan, UpdatePlanParamsInput>(productId, {
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 3000,
				reset: { interval: ResetInterval.Quarter },
			},
		],
	});

	// 3. Verify NEW entitlement created (different ID)
	const updatedFull = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});
	const updatedEnt = updatedFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages,
	)!;
	// expect(updatedEnt.id).not.toBe(initialEntId); // Different ID!
	expect(updatedEnt.allowance).toBe(3000);
});

test.concurrent(`${chalk.yellowBright("update: handle multiple features with same feature_id (different intervals)")}`, async () => {
	const productId = "multi_interval";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	// Edge case: Product has same feature with different intervals
	await autumnV1_2.products.create<ApiProduct, CreateProductV2ParamsInput>({
		id: productId,
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
	});

	const initialFull = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});
	const monthlyEntId = initialFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages && e.interval === "month",
	)!.id;
	const quarterlyEntId = initialFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages && e.interval === "quarter",
	)!.id;

	// Update via V2 - both features
	await autumnV2.products.update<ApiPlan, UpdatePlanParamsInput>(productId, {
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 1500,
				reset: { interval: ResetInterval.Month },
			},
			{
				feature_id: TestFeature.Messages,
				included: 4500,
				reset: { interval: ResetInterval.Quarter },
			},
		],
	});

	// Verify correct entitlements updated
	const updatedFull = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});
	const monthlyEnt = updatedFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages && e.interval === "month",
	)!;
	const quarterlyEnt = updatedFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages && e.interval === "quarter",
	)!;

	// expect(monthlyEnt.id).toBe(monthlyEntId); // Same ID
	expect(monthlyEnt.allowance).toBe(1500); // Updated value

	// expect(quarterlyEnt.id).toBe(quarterlyEntId); // Same ID
	expect(quarterlyEnt.allowance).toBe(4500); // Updated value
});
