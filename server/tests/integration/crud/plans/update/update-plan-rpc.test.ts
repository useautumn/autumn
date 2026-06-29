import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	type ApiProduct,
	ApiVersion,
	type CreatePlanParamsV2Input,
	type CreateProductV2ParamsInput,
	ErrCode,
	ProductItemInterval,
	products,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

const { db, org, env } = ctx;
type UpdatePlanRpcInput = Omit<UpdatePlanParamsV2Input, "plan_id">;

const catchErr = async (fn: () => Promise<unknown>) => {
	try {
		await fn();
		return null;
	} catch (error: unknown) {
		return error as { code?: string; statusCode?: number };
	}
};

const getDefaultPlanVersionRows = async (planId: string) =>
	db.query.products.findMany({
		where: and(
			eq(products.org_id, org.id),
			eq(products.env, env),
			eq(products.id, planId),
			eq(products.is_default, true),
		),
	});

test.concurrent(
	`${chalk.yellowBright("rpc update: match existing entitlement by feature_id (no entitlement_id)")}`,
	async () => {
		const productId = "rpc_update_match_1";
		const group = `rpc_group_${productId}`;
		try {
			await autumnRpc.plans.delete(productId, { allVersions: true });
		} catch (_error) {}

		await autumnV1_2.products.create<ApiProduct, CreateProductV2ParamsInput>({
			id: productId,
			name: "RPC Update Match Test",
			group,
			is_default: false,
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
		expect(
			initialFull.entitlements.find(
				(e) => e.feature_id === TestFeature.Messages,
			)?.id,
		).toBeDefined();

		await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(productId, {
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 2000,
					reset: { interval: ResetInterval.Month },
				},
			],
		});

		const updatedFull = await ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env,
		});

		expect(
			updatedFull.entitlements.find(
				(e) => e.feature_id === TestFeature.Messages,
			)?.allowance,
		).toBe(2000);
	},
);

test.concurrent(
	`${chalk.yellowBright("rpc update: match entitlement with same feature + interval")}`,
	async () => {
		const productId = "rpc_update_match_2";
		const group = `rpc_group_${productId}`;
		try {
			await autumnRpc.plans.delete(productId, { allVersions: true });
		} catch (_error) {}

		await autumnV1_2.products.create<ApiProduct, CreateProductV2ParamsInput>({
			id: productId,
			name: "RPC Quarterly Match Test",
			group,
			is_default: false,
			items: [
				{
					feature_id: TestFeature.Messages,
					included_usage: 500,
					interval: ProductItemInterval.Quarter,
				},
			],
		});

		await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(productId, {
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 1500,
					reset: { interval: ResetInterval.Quarter },
				},
			],
		});

		const updatedFull = await ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env,
		});

		expect(
			updatedFull.entitlements.find(
				(e) => e.feature_id === TestFeature.Messages,
			)?.allowance,
		).toBe(1500);
	},
);

test.concurrent(
	`${chalk.yellowBright("rpc update: create NEW entitlement when interval changes")}`,
	async () => {
		const productId = "rpc_update_interval_change";
		const group = `rpc_group_${productId}`;
		try {
			await autumnRpc.plans.delete(productId, { allVersions: true });
		} catch (_error) {}

		await autumnV1_2.products.create<ApiProduct, CreateProductV2ParamsInput>({
			id: productId,
			name: "RPC Interval Change Test",
			group,
			is_default: false,
			items: [
				{
					feature_id: TestFeature.Messages,
					included_usage: 1000,
					interval: ProductItemInterval.Month,
				},
			],
		});

		await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(productId, {
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 3000,
					reset: { interval: ResetInterval.Quarter },
				},
			],
		});

		const updatedFull = await ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env,
		});

		expect(
			updatedFull.entitlements.find(
				(e) => e.feature_id === TestFeature.Messages,
			)?.allowance,
		).toBe(3000);
	},
);

test.concurrent(
	`${chalk.yellowBright("rpc update: handle multiple features with same feature_id (different intervals)")}`,
	async () => {
		const productId = "rpc_multi_interval";
		const group = `rpc_group_${productId}`;
		try {
			await autumnRpc.plans.delete(productId, { allVersions: true });
		} catch (_error) {}

		await autumnV1_2.products.create<ApiProduct, CreateProductV2ParamsInput>({
			id: productId,
			name: "RPC Multi Interval Test",
			group,
			is_default: false,
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

		await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(productId, {
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

		const updatedFull = await ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env,
		});

		const monthlyEnt = updatedFull.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages && e.interval === "month",
		);
		const quarterlyEnt = updatedFull.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages && e.interval === "quarter",
		);

		expect(monthlyEnt?.allowance).toBe(1500);
		expect(quarterlyEnt?.allowance).toBe(4500);
	},
);

test.concurrent(
	`${chalk.yellowBright("rpc update: force version moves auto_enable to the new version")}`,
	async () => {
		const productId = "rpc_update_auto_enable_version";
		const group = `rpc_group_${productId}`;
		try {
			await autumnRpc.plans.delete(productId, { allVersions: true });
		} catch (_error) {}

		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: productId,
			name: "RPC Auto Enable Version Test",
			group,
			auto_enable: true,
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 1000,
					reset: { interval: ResetInterval.Month },
				},
			],
		});

		await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(productId, {
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 2000,
					reset: { interval: ResetInterval.Month },
				},
			],
			force_version: true,
		});

		const v1 = await ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env,
			version: 1,
		});
		const v2 = await ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env,
			version: 2,
		});
		const defaultRows = await getDefaultPlanVersionRows(productId);

		expect(v1.is_default).toBe(false);
		expect(v2.is_default).toBe(true);
		expect(defaultRows.map((row) => row.version)).toEqual([2]);

		const err = await catchErr(() =>
			autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(productId, {
				version: 1,
				auto_enable: true,
				disable_version: true,
			}),
		);
		const defaultRowsAfterError = await getDefaultPlanVersionRows(productId);

		expect(err).not.toBeNull();
		expect(err?.code).toBe(ErrCode.HistoricalPlanVersionCannotBeDefault);
		expect(defaultRowsAfterError.map((row) => row.version)).toEqual([2]);
	},
);
