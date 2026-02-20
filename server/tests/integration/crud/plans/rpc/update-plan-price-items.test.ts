import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });

const { db, org, env } = ctx;
type UpdatePlanRpcInput = Omit<UpdatePlanParamsV2Input, "plan_id">;

const getPriceAmount = ({
	full,
}: {
	full: Awaited<ReturnType<typeof ProductService.getFull>>;
}) => {
	const firstPrice = full.prices[0];
	if (!firstPrice) return undefined;
	const { config } = firstPrice;
	if (!("amount" in config)) return undefined;
	return config.amount;
};

const getPriceInterval = ({
	full,
}: {
	full: Awaited<ReturnType<typeof ProductService.getFull>>;
}) => {
	const firstPrice = full.prices[0];
	if (!firstPrice) return undefined;
	return firstPrice.config.interval;
};

const createTestPlan = async (planId: string) => {
	try {
		await autumnRpc.plans.delete(planId, { allVersions: true });
	} catch (_error) {}

	return await autumnRpc.plans.create<ApiPlanV1>({
		plan_id: planId,
		name: `Test Plan ${planId}`,
		group: `group_${planId}`,
		price: {
			amount: 1000,
			interval: BillingInterval.Month,
		},
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 100,
				reset: { interval: ResetInterval.Month },
			},
		],
	});
};

test.concurrent(`${chalk.yellowBright("rpc update: price and items undefined -> product items remain unchanged")}`, async () => {
	const planId = "rpc_update_unchanged";
	await createTestPlan(planId);

	const initialFull = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});

	const initialPriceCount = initialFull.prices.length;
	const initialEntitlementCount = initialFull.entitlements.length;
	const initialPriceAmount = getPriceAmount({ full: initialFull });
	const initialAllowance = initialFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages,
	)?.allowance;

	await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(planId, {
		name: "Updated Name Only",
	});

	const updatedFull = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});

	expect(updatedFull.prices.length).toBe(initialPriceCount);
	expect(updatedFull.entitlements.length).toBe(initialEntitlementCount);
	expect(getPriceAmount({ full: updatedFull })).toBe(initialPriceAmount);
	expect(
		updatedFull.entitlements.find((e) => e.feature_id === TestFeature.Messages)
			?.allowance,
	).toBe(initialAllowance);
});

test.concurrent(`${chalk.yellowBright("rpc update: price undefined, items defined -> base price unchanged, items change")}`, async () => {
	const planId = "rpc_update_items_only";
	await createTestPlan(planId);

	const initialFull = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});

	const initialPriceAmount = getPriceAmount({ full: initialFull });

	await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(planId, {
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 500,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	const updatedFull = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});

	expect(getPriceAmount({ full: updatedFull })).toBe(initialPriceAmount);
	expect(
		updatedFull.entitlements.find((e) => e.feature_id === TestFeature.Messages)
			?.allowance,
	).toBe(500);
});

test.concurrent(`${chalk.yellowBright("rpc update: price defined, items undefined -> base price changes, items unchanged")}`, async () => {
	const planId = "rpc_update_price_only";
	await createTestPlan(planId);

	const initialFull = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});

	const initialAllowance = initialFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages,
	)?.allowance;

	await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(planId, {
		price: {
			amount: 2500,
			interval: BillingInterval.Month,
		},
	});

	const updatedFull = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});

	expect(getPriceAmount({ full: updatedFull })).toBe(2500);
	expect(
		updatedFull.entitlements.find((e) => e.feature_id === TestFeature.Messages)
			?.allowance,
	).toBe(initialAllowance);
});

test.concurrent(`${chalk.yellowBright("rpc update: price null, items undefined -> base price removed, items unchanged")}`, async () => {
	const planId = "rpc_update_price_null";
	await createTestPlan(planId);

	const initialFull = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});

	expect(initialFull.prices.length).toBeGreaterThan(0);

	const initialAllowance = initialFull.entitlements.find(
		(e) => e.feature_id === TestFeature.Messages,
	)?.allowance;

	await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(planId, {
		price: null,
	});

	const updatedFull = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});

	expect(updatedFull.prices.length).toBe(0);
	expect(
		updatedFull.entitlements.find((e) => e.feature_id === TestFeature.Messages)
			?.allowance,
	).toBe(initialAllowance);
});

test.concurrent(`${chalk.yellowBright("rpc update: price defined, items defined -> base price and items changed")}`, async () => {
	const planId = "rpc_update_price_and_items";
	await createTestPlan(planId);

	await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(planId, {
		price: {
			amount: 5000,
			interval: BillingInterval.Year,
		},
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 1000,
				reset: { interval: ResetInterval.Year },
			},
		],
	});

	const updatedFull = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});

	expect(getPriceAmount({ full: updatedFull })).toBe(5000);
	expect(getPriceInterval({ full: updatedFull })).toBe(BillingInterval.Year);
	expect(
		updatedFull.entitlements.find((e) => e.feature_id === TestFeature.Messages)
			?.allowance,
	).toBe(1000);
});
