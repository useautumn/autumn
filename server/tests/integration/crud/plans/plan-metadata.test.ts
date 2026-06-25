import { expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiPlanV1,
	type ApiProduct,
	ApiVersion,
	type CreatePlanParamsV2Input,
	type CreateProductV2ParamsInput,
	ProductItemInterval,
	products,
	ResetInterval,
	type UpdatePlanParamsInput,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });
const autumnV2_0 = new AutumnInt({ version: ApiVersion.V2_0 });

const { db, org, env } = ctx;
type UpdatePlanRpcInput = Omit<UpdatePlanParamsV2Input, "plan_id">;

const getDbMetadata = async (planId: string) => {
	const product = await ProductService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
	});
	return product.metadata;
};

const getAllVersionMetadata = async (planId: string) => {
	const rows = await db.query.products.findMany({
		where: and(
			eq(products.org_id, org.id),
			eq(products.env, env),
			eq(products.id, planId),
		),
	});
	return rows.map((row) => ({ version: row.version, metadata: row.metadata }));
};

test.concurrent(
	`${chalk.yellowBright("plan metadata: create plan with metadata round-trips")}`,
	async () => {
		const planId = "plan_metadata_create";
		const group = `grp_${planId}`;
		const metadata = {
			tier: "gold",
			highlights: ["fast", "priority support"],
		};

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		const created = await autumnRpc.plans.create<
			ApiPlanV1,
			CreatePlanParamsV2Input
		>({
			plan_id: planId,
			name: "Plan Metadata Create",
			group,
			auto_enable: false,
			metadata,
		});

		expect(created.metadata).toEqual(metadata);

		const fetched = await autumnRpc.plans.get<ApiPlanV1>(planId);
		expect(fetched.metadata).toEqual(metadata);

		expect(await getDbMetadata(planId)).toEqual(metadata);
	},
);

test.concurrent(
	`${chalk.yellowBright("plan metadata: defaults to {} on create when omitted")}`,
	async () => {
		const planId = "plan_metadata_default";
		const group = `grp_${planId}`;

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		const created = await autumnRpc.plans.create<
			ApiPlanV1,
			CreatePlanParamsV2Input
		>({
			plan_id: planId,
			name: "Plan Metadata Default",
			group,
			auto_enable: false,
		});

		expect(created.metadata).toEqual({});
		expect(await getDbMetadata(planId)).toEqual({});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan metadata: update sets new metadata")}`,
	async () => {
		const planId = "plan_metadata_update";
		const group = `grp_${planId}`;

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "Plan Metadata Update",
			group,
			auto_enable: false,
		});

		const updated = await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(
			planId,
			{ metadata: { color: "blue", tags: ["a", "b"] } },
		);
		expect(updated.metadata).toEqual({ color: "blue", tags: ["a", "b"] });

		const fetched = await autumnRpc.plans.get<ApiPlanV1>(planId);
		expect(fetched.metadata).toEqual({ color: "blue", tags: ["a", "b"] });

		expect(await getDbMetadata(planId)).toEqual({
			color: "blue",
			tags: ["a", "b"],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan metadata: shared across all versions (carry-forward + fan-out)")}`,
	async () => {
		const planId = "plan_metadata_versions";
		const group = `grp_${planId}`;
		const customerId = "plan_metadata_versions_cus";
		const metadataA = { plan: "pro" };
		const metadataB = { plan: "pro", added: "later" };

		try {
			await autumnV1_2.customers.delete(customerId);
		} catch (_error) {}
		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		await autumnV1_2.products.create<ApiProduct, CreateProductV2ParamsInput>({
			id: planId,
			name: "Plan Metadata Versions",
			group,
			items: [
				{
					feature_id: TestFeature.Messages,
					included_usage: 500,
					interval: ProductItemInterval.Month,
				},
			],
			metadata: metadataA,
		});

		await autumnV1_2.attach({ customer_id: customerId, product_id: planId });

		await autumnV2_0.products.update<ApiPlan, UpdatePlanParamsInput>(planId, {
			id: planId,
			name: "Plan Metadata Versions",
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 1000,
					reset: { interval: ResetInterval.Month },
				},
			],
		});

		const afterVersioning = await getAllVersionMetadata(planId);
		expect(afterVersioning.length).toBeGreaterThanOrEqual(2);
		for (const row of afterVersioning) {
			expect(row.metadata).toEqual(metadataA);
		}

		await autumnV2_0.products.update<ApiPlan, UpdatePlanParamsInput>(planId, {
			metadata: metadataB,
		});

		const afterFanout = await getAllVersionMetadata(planId);
		expect(afterFanout.length).toBe(afterVersioning.length);
		for (const row of afterFanout) {
			expect(row.metadata).toEqual(metadataB);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("plan metadata: items-unchanged update returns fresh metadata")}`,
	async () => {
		const planId = "plan_metadata_unchanged_items";
		const group = `grp_${planId}`;
		const customerId = "plan_metadata_unchanged_items_cus";
		const item = {
			feature_id: TestFeature.Messages,
			included: 500,
			reset: { interval: ResetInterval.Month },
		};

		try {
			await autumnV1_2.customers.delete(customerId);
		} catch (_error) {}
		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		await autumnV1_2.products.create<ApiProduct, CreateProductV2ParamsInput>({
			id: planId,
			name: "Plan Metadata Unchanged Items",
			group,
			items: [
				{
					feature_id: TestFeature.Messages,
					included_usage: 500,
					interval: ProductItemInterval.Month,
				},
			],
		});

		await autumnV1_2.attach({ customer_id: customerId, product_id: planId });

		const updated = await autumnV2_0.products.update<
			ApiPlan & { metadata?: Record<string, unknown> },
			UpdatePlanParamsInput
		>(planId, {
			id: planId,
			name: "Plan Metadata Unchanged Items",
			items: [item],
			metadata: { unchanged: "items" },
		});

		expect(updated.metadata).toEqual({ unchanged: "items" });
		expect(await getDbMetadata(planId)).toEqual({ unchanged: "items" });
	},
);
