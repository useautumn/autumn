/**
 * TDD test for plan update all_versions propagation.
 *
 * Contract under test:
 *   New types/fields:
 *     - UpdatePlanParamsV2.all_versions?: boolean
 *     - PlanUpdatePreview.other_versions: same preview/change shape as variants
 *   New behaviors:
 *     - disable_version and all_versions are mutually exclusive.
 *     - all_versions updates every version of the target plan with the incoming diff.
 *     - all_versions propagates the same behavior to selected variants.
 *     - preview_update exposes historical versions that would receive the diff.
 *   Side effects:
 *     - Existing product version rows are patched in place; no new version is created.
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	ErrCode,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import { createVariantPlan } from "../variants/utils/variantTestPlanUtils.js";
import { expectPlanItemsCorrect } from "./utils/expectPlanItemsCorrect.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;
type TestContext = Awaited<ReturnType<typeof initScenario>>["ctx"];
type FullProductResult = NonNullable<
	Awaited<ReturnType<typeof ProductService.getFull>>
>;

const monthlyMessagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const getRequiredProduct = async ({
	ctx,
	planId,
	version,
}: {
	ctx: TestContext;
	planId: string;
	version?: number;
}) => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});
	expect(product).toBeDefined();
	return product as FullProductResult;
};

const expectMessagesAllowance = async ({
	ctx,
	product,
	included,
}: {
	ctx: TestContext;
	product: FullProductResult;
	included: number;
}) => {
	const plan = await getPlanResponse({
		ctx,
		product,
		features: ctx.features,
	});
	expectPlanItemsCorrect({
		plan,
		items: [monthlyMessagesItem(included)],
		exact: true,
	});
};

const catchErr = async (fn: () => Promise<unknown>) => {
	try {
		await fn();
		return null;
	} catch (error: unknown) {
		return error as { code?: string; statusCode?: number };
	}
};

const setupVersionedBaseAndVariant = async (testId: string) => {
	const baseId = `all_versions_${testId}_base`;
	const customerId = `all_versions_${testId}_customer`;
	const base = products.base({
		id: baseId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [base] })],
		actions: [],
	});
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	const createdBaseId = base.id;
	const variantId = `${createdBaseId}_annual`;
	await createVariantPlan({
		rpc,
		basePlanId: createdBaseId,
		variantPlanId: variantId,
		name: "Annual Variant",
	});
	await rpc.plans.update<ApiPlanV1, RpcUpdate>(createdBaseId, {
		items: [monthlyMessagesItem(500)],
		update_variant_ids: [variantId],
		force_version: true,
	});

	return { autumnV2_3, baseId: createdBaseId, ctx, rpc, variantId };
};

test.concurrent(
	`${chalk.yellowBright("plan update all_versions: rejects disable_version")}`,
	async () => {
		const { baseId, rpc } = await setupVersionedBaseAndVariant("reject");

		const error = await catchErr(() =>
			rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
				items: [monthlyMessagesItem(800)],
				all_versions: true,
				disable_version: true,
			}),
		);

		expect(error?.code).toBe(ErrCode.ConflictingVersionFlags);
		expect(error?.statusCode).toBe(400);
	},
);

test.concurrent(
	`${chalk.yellowBright("plan update all_versions: patches every base and selected variant version")}`,
	async () => {
		const { baseId, ctx, rpc, variantId } =
			await setupVersionedBaseAndVariant("propagate");

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(baseId, {
			items: [monthlyMessagesItem(800)],
			update_variant_ids: [variantId],
			all_versions: true,
		});

		const baseV1 = await getRequiredProduct({
			ctx,
			planId: baseId,
			version: 1,
		});
		const baseLatest = await getRequiredProduct({ ctx, planId: baseId });
		const variantV1 = await getRequiredProduct({
			ctx,
			planId: variantId,
			version: 1,
		});
		const variantLatest = await getRequiredProduct({ ctx, planId: variantId });

		expect(baseLatest.version).toBe(2);
		expect(variantLatest.version).toBe(2);
		await expectMessagesAllowance({ ctx, product: baseV1, included: 800 });
		await expectMessagesAllowance({ ctx, product: baseLatest, included: 800 });
		await expectMessagesAllowance({ ctx, product: variantV1, included: 800 });
		await expectMessagesAllowance({
			ctx,
			product: variantLatest,
			included: 800,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plans preview_update: exposes historical versions affected by all_versions")}`,
	async () => {
		const { autumnV2_3, baseId } =
			await setupVersionedBaseAndVariant("preview");

		const preview = await autumnV2_3.plans.previewUpdate<{
			other_versions: Array<{
				plan_id: string;
				version: number;
				customize: unknown;
				item_changes: unknown[];
				conflicts: unknown[];
			}>;
		}>({
			plan_id: baseId,
			items: [monthlyMessagesItem(800)],
			all_versions: true,
		});

		expect(preview.other_versions).toHaveLength(1);
		expect(preview.other_versions[0]).toMatchObject({
			plan_id: baseId,
			version: 1,
		});
		expect(preview.other_versions[0]?.conflicts).toContainEqual(
			expect.objectContaining({ reason: "value_divergence" }),
		);
		expect(preview.other_versions[0]?.customize).toBeTruthy();
		expect(preview.other_versions[0]?.item_changes.length).toBeGreaterThan(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog update all_versions: patches every base and selected variant version")}`,
	async () => {
		const { autumnV2_3, baseId, ctx, variantId } =
			await setupVersionedBaseAndVariant("catalog");

		await autumnV2_3.catalog.update({
			features: [],
			plans: [
				{
					plan_id: baseId,
					items: [monthlyMessagesItem(900)],
					update_variant_ids: [variantId],
					all_versions: true,
				},
			],
			skip_deletions: true,
		});

		const baseV1 = await getRequiredProduct({
			ctx,
			planId: baseId,
			version: 1,
		});
		const baseLatest = await getRequiredProduct({ ctx, planId: baseId });
		const variantV1 = await getRequiredProduct({
			ctx,
			planId: variantId,
			version: 1,
		});
		const variantLatest = await getRequiredProduct({ ctx, planId: variantId });

		expect(baseLatest.version).toBe(2);
		expect(variantLatest.version).toBe(2);
		await expectMessagesAllowance({ ctx, product: baseV1, included: 900 });
		await expectMessagesAllowance({ ctx, product: baseLatest, included: 900 });
		await expectMessagesAllowance({ ctx, product: variantV1, included: 900 });
		await expectMessagesAllowance({
			ctx,
			product: variantLatest,
			included: 900,
		});
	},
);
