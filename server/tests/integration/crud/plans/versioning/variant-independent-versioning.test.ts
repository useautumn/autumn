import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiPlanV1,
	ApiVersion,
	type AttachParamsV1Input,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import { createVariantPlan } from "../variants/utils/variantTestPlanUtils.js";
import { expectPlanItemsCorrect } from "./utils/expectPlanItemsCorrect.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;
type TestContext = {
	db: unknown;
	env: unknown;
	features: unknown;
	org: { id: string };
	orgSecretKey: string;
};
type FullProductResult = NonNullable<
	Awaited<ReturnType<typeof ProductService.getFull>>
>;

type VariantSetup = {
	key: string;
	attachCustomer?: boolean;
};

const monthlyMessagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const getFullProduct = ({
	ctx,
	planId,
	version,
}: {
	ctx: TestContext;
	planId: string;
	version?: number;
}) =>
	ProductService.getFull({
		db: ctx.db as never,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env as never,
		version,
	});

const getApiPlan = ({
	ctx,
	product,
}: {
	ctx: TestContext;
	product: FullProductResult;
}) =>
	getPlanResponse({
		ctx: ctx as never,
		product,
		features: ctx.features as never,
	});

const expectMessagesAllowance = async ({
	ctx,
	product,
	included,
}: {
	ctx: TestContext;
	product: FullProductResult;
	included: number;
}) => {
	expectPlanItemsCorrect({
		plan: await getApiPlan({ ctx, product }),
		items: [monthlyMessagesItem(included)],
		exact: true,
	});
};

const getRequiredProduct = async (params: {
	ctx: TestContext;
	planId: string;
	version?: number;
}) => {
	const product = await getFullProduct(params);
	expect(product).toBeDefined();
	return product as FullProductResult;
};

const getOptionalProduct = (params: {
	ctx: TestContext;
	planId: string;
	version?: number;
}) =>
	ProductService.getFull({
		db: params.ctx.db as never,
		idOrInternalId: params.planId,
		orgId: params.ctx.org.id,
		env: params.ctx.env as never,
		version: params.version,
		allowNotFound: true,
	});

const migrationMentionsPlan = (
	migration: { filter: unknown },
	planId: string,
) => JSON.stringify(migration.filter).includes(planId);

const setupVariantVersioning = async ({
	testId,
	attachBaseCustomer = false,
	variants,
}: {
	testId: string;
	attachBaseCustomer?: boolean;
	variants: VariantSetup[];
}) => {
	const customerId = `variant_versioning_${testId}`;
	const variantCustomerIds = variants
		.filter((variant) => variant.attachCustomer)
		.map((variant) => `${customerId}_${variant.key}`);
	const base = products.base({
		id: "base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [base] }),
			...(variantCustomerIds.length > 0
				? [s.otherCustomers(variantCustomerIds.map((id) => ({ id })))]
				: []),
		],
		actions: attachBaseCustomer
			? [s.billing.attach({ productId: base.id })]
			: [],
	});
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	const variantIds: Record<string, string> = {};
	const variantV1ByKey: Record<string, FullProductResult> = {};

	for (const variant of variants) {
		const variantId = `${base.id}_${variant.key}`;
		variantIds[variant.key] = variantId;

		await createVariantPlan({
			rpc,
			basePlanId: base.id,
			variantPlanId: variantId,
			name: `Variant ${variant.key}`,
		});

		if (variant.attachCustomer) {
			await autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: `${customerId}_${variant.key}`,
				plan_id: variantId,
			});
		}

		variantV1ByKey[variant.key] = await getRequiredProduct({
			ctx,
			planId: variantId,
		});
	}

	const baseV1 = await getRequiredProduct({ ctx, planId: base.id });

	return {
		autumnV2_2,
		baseId: base.id,
		baseCustomerId: customerId,
		baseV1,
		ctx,
		rpc,
		variantCustomerIds,
		variantIds,
		variantV1ByKey,
	};
};

const expectCustomerGrantUnchanged = async ({
	autumnV2_2,
	customerId,
	planId,
}: {
	autumnV2_2: {
		customers: { get: <T>(customerId: string) => Promise<T> };
	};
	customerId: string;
	planId: string;
}) => {
	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [planId] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		planId,
		granted: 100,
		remaining: 100,
	});
};

const expectInPlaceMessagesPlan = async ({
	ctx,
	planId,
	before,
	included,
	baseInternalProductId,
}: {
	ctx: TestContext;
	planId: string;
	before: FullProductResult;
	included: number;
	baseInternalProductId?: string;
}) => {
	const after = await getRequiredProduct({ ctx, planId });
	expect(after.version).toBe(before.version);
	expect(after.internal_id).toBe(before.internal_id);
	if (baseInternalProductId !== undefined) {
		expect(after.base_internal_product_id).toBe(baseInternalProductId);
	}
	await expectMessagesAllowance({ ctx, product: after, included });
	return after;
};

test.concurrent(
	`${chalk.yellowBright("plan versioning: no customers anywhere, propagated update edits base and variant in place")}`,
	async () => {
		const { baseId, baseV1, ctx, rpc, variantIds, variantV1ByKey } =
			await setupVariantVersioning({
				testId: "none_propagate",
				variants: [{ key: "annual" }],
			});
		const variantId = variantIds.annual;
		const variantV1 = variantV1ByKey.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			update_variant_ids: [variantId],
		});

		const baseAfter = await getRequiredProduct({ ctx, planId: baseId });
		const variantAfter = await getRequiredProduct({ ctx, planId: variantId });

		expect(baseAfter.version).toBe(1);
		expect(baseAfter.internal_id).toBe(baseV1.internal_id);
		await expectMessagesAllowance({ ctx, product: baseAfter, included: 500 });

		expect(variantAfter.version).toBe(1);
		expect(variantAfter.internal_id).toBe(variantV1.internal_id);
		expect(variantAfter.base_internal_product_id).toBe(baseAfter.internal_id);
		await expectMessagesAllowance({
			ctx,
			product: variantAfter,
			included: 500,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan versioning: disable_version base customer only, omitted propagation edits base in place")}`,
	async () => {
		const {
			autumnV2_2,
			baseCustomerId,
			baseId,
			baseV1,
			ctx,
			rpc,
			variantIds,
			variantV1ByKey,
		} = await setupVariantVersioning({
			testId: "disable_base_only_no_propagate",
			attachBaseCustomer: true,
			variants: [{ key: "annual" }],
		});
		const variantId = variantIds.annual;
		const variantV1 = variantV1ByKey.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			disable_version: true,
		});

		const baseAfter = await expectInPlaceMessagesPlan({
			ctx,
			planId: baseId,
			before: baseV1,
			included: 500,
		});
		await expectInPlaceMessagesPlan({
			ctx,
			planId: variantId,
			before: variantV1,
			included: 100,
			baseInternalProductId: baseAfter.internal_id,
		});
		await expectCustomerGrantUnchanged({
			autumnV2_2,
			customerId: baseCustomerId,
			planId: baseId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan versioning: disable_version variant customer only, propagated update edits variant in place")}`,
	async () => {
		const {
			autumnV2_2,
			baseId,
			baseV1,
			ctx,
			rpc,
			variantCustomerIds,
			variantIds,
			variantV1ByKey,
		} = await setupVariantVersioning({
			testId: "disable_variant_only_propagate",
			variants: [{ key: "annual", attachCustomer: true }],
		});
		const variantId = variantIds.annual;
		const variantV1 = variantV1ByKey.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			update_variant_ids: [variantId],
			disable_version: true,
		});

		const baseAfter = await expectInPlaceMessagesPlan({
			ctx,
			planId: baseId,
			before: baseV1,
			included: 500,
		});
		await expectInPlaceMessagesPlan({
			ctx,
			planId: variantId,
			before: variantV1,
			included: 500,
			baseInternalProductId: baseAfter.internal_id,
		});
		await expectCustomerGrantUnchanged({
			autumnV2_2,
			customerId: variantCustomerIds[0],
			planId: variantId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan versioning: disable_version base and variant customers, propagated update edits both in place")}`,
	async () => {
		const {
			autumnV2_2,
			baseCustomerId,
			baseId,
			baseV1,
			ctx,
			rpc,
			variantCustomerIds,
			variantIds,
			variantV1ByKey,
		} = await setupVariantVersioning({
			testId: "disable_both_customers_propagate",
			attachBaseCustomer: true,
			variants: [{ key: "annual", attachCustomer: true }],
		});
		const variantId = variantIds.annual;
		const variantV1 = variantV1ByKey.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			update_variant_ids: [variantId],
			disable_version: true,
		});

		const baseAfter = await expectInPlaceMessagesPlan({
			ctx,
			planId: baseId,
			before: baseV1,
			included: 500,
		});
		await expectInPlaceMessagesPlan({
			ctx,
			planId: variantId,
			before: variantV1,
			included: 500,
			baseInternalProductId: baseAfter.internal_id,
		});
		await expectCustomerGrantUnchanged({
			autumnV2_2,
			customerId: baseCustomerId,
			planId: baseId,
		});
		await expectCustomerGrantUnchanged({
			autumnV2_2,
			customerId: variantCustomerIds[0],
			planId: variantId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plans update: disable_version with create_migration creates combined migration draft")}`,
	async () => {
		const { baseId, ctx, rpc, variantIds } = await setupVariantVersioning({
			testId: "update_create_migration",
			attachBaseCustomer: true,
			variants: [{ key: "annual", attachCustomer: true }],
		});
		const variantId = variantIds.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			update_variant_ids: [variantId],
			disable_version: true,
			create_migration: true,
		});

		const migrations = (await migrationRepo.get({ ctx })).filter((migration) =>
			migrationMentionsPlan(migration, baseId),
		);
		const migration = migrations.find((candidate) =>
			candidate.id.startsWith("plan-migrate-2-"),
		);
		const [operation] = migration?.operations?.customer ?? [];

		expect(operation).toMatchObject({
			type: "update_plan",
			version: 1,
			plan_filter: {
				plan_id: { $in: [baseId, variantId] },
				custom: false,
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plans update: all_versions with create_migration creates diff migration draft")}`,
	async () => {
		const { baseId, ctx, rpc, variantIds } = await setupVariantVersioning({
			testId: "all_versions_create_migration",
			attachBaseCustomer: true,
			variants: [{ key: "annual", attachCustomer: true }],
		});
		const variantId = variantIds.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			update_variant_ids: [variantId],
			all_versions: true,
			create_migration: true,
		});

		const migrations = (await migrationRepo.get({ ctx })).filter((migration) =>
			migrationMentionsPlan(migration, baseId),
		);
		const migration = migrations.find((candidate) =>
			candidate.id.startsWith("plan-update-all-2-"),
		);
		const operations = migration?.operations?.customer ?? [];

		expect(migration?.filter).toMatchObject({
			customer: {
				plan: {
					plan_id: { $in: [baseId, variantId] },
					custom: false,
				},
			},
		});
		expect(operations).toHaveLength(2);
		expect(operations[0]).toMatchObject({
			type: "update_plan",
			plan_filter: { plan_id: baseId, custom: false },
			customize: expect.objectContaining({
				add_items: [
					expect.objectContaining({ feature_id: TestFeature.Messages }),
				],
			}),
		});
		expect(operations[0]).not.toHaveProperty("version");
		expect(operations[1]).toMatchObject({
			type: "update_plan",
			plan_filter: { plan_id: variantId, custom: false },
			customize: expect.objectContaining({
				add_items: [
					expect.objectContaining({ feature_id: TestFeature.Messages }),
				],
			}),
		});
		expect(operations[1]).not.toHaveProperty("version");
	},
);

test.concurrent(
	`${chalk.yellowBright("plan versioning: base customer only, omitted propagation moves variant to latest base without versioning")}`,
	async () => {
		const {
			autumnV2_2,
			baseCustomerId,
			baseId,
			baseV1,
			ctx,
			rpc,
			variantIds,
			variantV1ByKey,
		} = await setupVariantVersioning({
			testId: "base_only_no_propagate",
			attachBaseCustomer: true,
			variants: [{ key: "annual" }],
		});
		const variantId = variantIds.annual;
		const variantV1 = variantV1ByKey.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
		});

		const baseV2 = await getRequiredProduct({ ctx, planId: baseId });
		const variantAfter = await getRequiredProduct({ ctx, planId: variantId });

		expect(baseV2.version).toBe(2);
		expect(baseV2.internal_id).not.toBe(baseV1.internal_id);
		await expectMessagesAllowance({ ctx, product: baseV2, included: 500 });

		expect(variantAfter.version).toBe(1);
		expect(variantAfter.internal_id).toBe(variantV1.internal_id);
		expect(variantAfter.base_internal_product_id).toBe(baseV2.internal_id);
		await expectMessagesAllowance({
			ctx,
			product: variantAfter,
			included: 100,
		});
		await expectCustomerGrantUnchanged({
			autumnV2_2,
			customerId: baseCustomerId,
			planId: baseId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan versioning: base customer only, propagated update versions base and edits variant in place")}`,
	async () => {
		const {
			autumnV2_2,
			baseCustomerId,
			baseId,
			baseV1,
			ctx,
			rpc,
			variantIds,
			variantV1ByKey,
		} = await setupVariantVersioning({
			testId: "base_only_propagate",
			attachBaseCustomer: true,
			variants: [{ key: "annual" }],
		});
		const variantId = variantIds.annual;
		const variantV1 = variantV1ByKey.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			update_variant_ids: [variantId],
		});

		const baseV2 = await getRequiredProduct({ ctx, planId: baseId });
		const variantAfter = await getRequiredProduct({ ctx, planId: variantId });

		expect(baseV2.version).toBe(2);
		expect(baseV2.internal_id).not.toBe(baseV1.internal_id);
		await expectMessagesAllowance({ ctx, product: baseV2, included: 500 });

		expect(variantAfter.version).toBe(1);
		expect(variantAfter.internal_id).toBe(variantV1.internal_id);
		expect(variantAfter.base_internal_product_id).toBe(baseV2.internal_id);
		await expectMessagesAllowance({
			ctx,
			product: variantAfter,
			included: 500,
		});
		await expectCustomerGrantUnchanged({
			autumnV2_2,
			customerId: baseCustomerId,
			planId: baseId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan versioning: variant customer only, propagated base update edits base in place and versions variant")}`,
	async () => {
		const {
			autumnV2_2,
			baseId,
			baseV1,
			ctx,
			rpc,
			variantCustomerIds,
			variantIds,
			variantV1ByKey,
		} = await setupVariantVersioning({
			testId: "variant_only_propagate",
			variants: [{ key: "annual", attachCustomer: true }],
		});
		const variantId = variantIds.annual;
		const variantV1 = variantV1ByKey.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			update_variant_ids: [variantId],
		});

		const baseAfter = await getRequiredProduct({ ctx, planId: baseId });
		const variantV1After = await getRequiredProduct({
			ctx,
			planId: variantId,
			version: 1,
		});
		const variantV2 = await getRequiredProduct({ ctx, planId: variantId });

		expect(baseAfter.version).toBe(1);
		expect(baseAfter.internal_id).toBe(baseV1.internal_id);
		await expectMessagesAllowance({ ctx, product: baseAfter, included: 500 });

		expect(variantV1After.internal_id).toBe(variantV1.internal_id);
		expect(variantV1After.base_internal_product_id).toBe(baseAfter.internal_id);
		await expectMessagesAllowance({
			ctx,
			product: variantV1After,
			included: 100,
		});

		expect(variantV2.version).toBe(2);
		expect(variantV2.internal_id).not.toBe(variantV1.internal_id);
		expect(variantV2.base_internal_product_id).toBe(baseAfter.internal_id);
		await expectMessagesAllowance({ ctx, product: variantV2, included: 500 });
		await expectCustomerGrantUnchanged({
			autumnV2_2,
			customerId: variantCustomerIds[0],
			planId: variantId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan versioning: mixed variants, propagated update versions only customer-bearing variants")}`,
	async () => {
		const {
			autumnV2_2,
			baseId,
			baseV1,
			ctx,
			rpc,
			variantCustomerIds,
			variantIds,
			variantV1ByKey,
		} = await setupVariantVersioning({
			testId: "mixed_variants_propagate",
			variants: [{ key: "annual", attachCustomer: true }, { key: "quarterly" }],
		});
		const customerVariantId = variantIds.annual;
		const emptyVariantId = variantIds.quarterly;
		const customerVariantV1 = variantV1ByKey.annual;
		const emptyVariantV1 = variantV1ByKey.quarterly;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			update_variant_ids: [customerVariantId, emptyVariantId],
		});

		const baseAfter = await getRequiredProduct({ ctx, planId: baseId });
		const customerVariantV2 = await getRequiredProduct({
			ctx,
			planId: customerVariantId,
		});
		const emptyVariantAfter = await getRequiredProduct({
			ctx,
			planId: emptyVariantId,
		});

		expect(baseAfter.version).toBe(1);
		expect(baseAfter.internal_id).toBe(baseV1.internal_id);
		await expectMessagesAllowance({ ctx, product: baseAfter, included: 500 });

		expect(customerVariantV2.version).toBe(2);
		expect(customerVariantV2.internal_id).not.toBe(
			customerVariantV1.internal_id,
		);
		expect(customerVariantV2.base_internal_product_id).toBe(
			baseAfter.internal_id,
		);
		await expectMessagesAllowance({
			ctx,
			product: customerVariantV2,
			included: 500,
		});

		expect(emptyVariantAfter.version).toBe(1);
		expect(emptyVariantAfter.internal_id).toBe(emptyVariantV1.internal_id);
		expect(emptyVariantAfter.base_internal_product_id).toBe(
			baseAfter.internal_id,
		);
		await expectMessagesAllowance({
			ctx,
			product: emptyVariantAfter,
			included: 500,
		});
		await expectCustomerGrantUnchanged({
			autumnV2_2,
			customerId: variantCustomerIds[0],
			planId: customerVariantId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan versioning: base and variant both have customers, propagated update versions both and grandfathers both old versions")}`,
	async () => {
		const {
			autumnV2_2,
			baseCustomerId,
			baseId,
			baseV1,
			ctx,
			rpc,
			variantCustomerIds,
			variantIds,
			variantV1ByKey,
		} = await setupVariantVersioning({
			testId: "both_customers_propagate",
			attachBaseCustomer: true,
			variants: [{ key: "annual", attachCustomer: true }],
		});
		const variantId = variantIds.annual;
		const variantV1 = variantV1ByKey.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			update_variant_ids: [variantId],
		});

		const baseV2 = await getRequiredProduct({ ctx, planId: baseId });
		const variantV1After = await getRequiredProduct({
			ctx,
			planId: variantId,
			version: 1,
		});
		const variantV2 = await getRequiredProduct({ ctx, planId: variantId });

		expect(baseV2.version).toBe(2);
		expect(baseV2.internal_id).not.toBe(baseV1.internal_id);
		await expectMessagesAllowance({ ctx, product: baseV2, included: 500 });

		expect(variantV1After.internal_id).toBe(variantV1.internal_id);
		expect(variantV1After.base_internal_product_id).toBe(baseV1.internal_id);
		await expectMessagesAllowance({
			ctx,
			product: variantV1After,
			included: 100,
		});

		expect(variantV2.version).toBe(2);
		expect(variantV2.internal_id).not.toBe(variantV1.internal_id);
		expect(variantV2.base_internal_product_id).toBe(baseV2.internal_id);
		await expectMessagesAllowance({ ctx, product: variantV2, included: 500 });
		await expectCustomerGrantUnchanged({
			autumnV2_2,
			customerId: baseCustomerId,
			planId: baseId,
		});
		await expectCustomerGrantUnchanged({
			autumnV2_2,
			customerId: variantCustomerIds[0],
			planId: variantId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan delete: deleting latest base version relinks variants to previous base version")}`,
	async () => {
		const { baseId, baseV1, ctx, rpc, variantIds } =
			await setupVariantVersioning({
				testId: "delete_latest_base_relink",
				variants: [{ key: "annual" }],
			});
		const variantId = variantIds.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			force_version: true,
		});

		const baseV2 = await getRequiredProduct({ ctx, planId: baseId });
		const variantBeforeDelete = await getRequiredProduct({
			ctx,
			planId: variantId,
		});
		expect(baseV2.version).toBe(2);
		expect(variantBeforeDelete.base_internal_product_id).toBe(
			baseV2.internal_id,
		);

		await rpc.plans.delete(baseId);

		const deletedBaseV2 = await getOptionalProduct({
			ctx,
			planId: baseId,
			version: 2,
		});
		const latestBase = await getRequiredProduct({ ctx, planId: baseId });
		const variantAfterDelete = await getRequiredProduct({
			ctx,
			planId: variantId,
		});

		expect(deletedBaseV2).toBeNull();
		expect(latestBase.version).toBe(1);
		expect(latestBase.internal_id).toBe(baseV1.internal_id);
		expect(variantAfterDelete.base_internal_product_id).toBe(
			baseV1.internal_id,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog update: removing latest base version relinks variants to previous base version")}`,
	async () => {
		const { autumnV2_2, baseId, baseV1, ctx, rpc, variantIds } =
			await setupVariantVersioning({
				testId: "catalog_delete_latest_base_relink",
				variants: [{ key: "annual" }],
			});
		const variantId = variantIds.annual;

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(500)],
			force_version: true,
		});

		const baseV2 = await getRequiredProduct({ ctx, planId: baseId });
		const variantBeforeDelete = await getRequiredProduct({
			ctx,
			planId: variantId,
		});
		expect(baseV2.version).toBe(2);
		expect(variantBeforeDelete.base_internal_product_id).toBe(
			baseV2.internal_id,
		);

		const plansToKeep = await ProductService.listFull({
			db: ctx.db as never,
			orgId: ctx.org.id,
			env: ctx.env as never,
			returnAll: true,
		});
		const skipPlanIds = [
			...new Set(
				plansToKeep
					.map((product) => product.id)
					.filter((planId) => planId !== baseId),
			),
		];

		await autumnV2_2.catalog.update({
			features: [],
			plans: [{ plan_id: baseId, version: 1 }],
			skip_deletions: false,
			skip_feature_ids: ctx.features.map((feature) => feature.id),
			skip_plan_ids: skipPlanIds,
		});

		const deletedBaseV2 = await getOptionalProduct({
			ctx,
			planId: baseId,
			version: 2,
		});
		const latestBase = await getRequiredProduct({ ctx, planId: baseId });
		const variantAfterDelete = await getRequiredProduct({
			ctx,
			planId: variantId,
		});

		expect(deletedBaseV2).toBeNull();
		expect(latestBase.version).toBe(1);
		expect(latestBase.internal_id).toBe(baseV1.internal_id);
		expect(variantAfterDelete.base_internal_product_id).toBe(
			baseV1.internal_id,
		);
	},
);
