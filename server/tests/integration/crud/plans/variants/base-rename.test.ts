/**
 * Plan variants — base rename must not clobber variant names.
 *
 * Variants own their name ("Pro Annual"); renaming the base ("Pro" → "Pro
 * Plus") propagates settings but must leave every variant's name intact,
 * in both the update and preview_update paths.
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type PlanUpdatePreview,
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
import { readableVariantTestId } from "./utils/readableVariantTestId.js";
import { createVariantPlan } from "./utils/variantTestPlanUtils.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;

const getFull = (
	ctx: { db: any; org: { id: string }; env: any },
	planId: string,
) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

const monthlyItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const setupBaseWithAnnualVariant = async (label: string) => {
	const cid = readableVariantTestId(label);
	const base = products.pro({
		id: `br_base_${cid}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { ctx } = await initScenario({
		customerId: cid,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [],
	});

	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	const variantId = `br_var_${cid}`;

	await createVariantPlan({
		rpc,
		basePlanId: base.id,
		variantPlanId: variantId,
		name: "Pro Annual",
	});
	await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
		price: { amount: 200, interval: BillingInterval.Year },
		disable_version: true,
	});

	return { ctx, rpc, base, variantId };
};

test.concurrent(
	`${chalk.yellowBright("variants base rename: variant keeps its own name")}`,
	async () => {
		const { ctx, rpc, base, variantId } =
			await setupBaseWithAnnualVariant("br_only");

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
			name: "Pro Plus",
		});

		const baseFull = await getFull(ctx, base.id);
		const variantFull = await getFull(ctx, variantId);

		expect(baseFull.name).toBe("Pro Plus");
		expect(variantFull.name).toBe("Pro Annual");
	},
);

test.concurrent(
	`${chalk.yellowBright("variants base rename: propagated item update keeps variant name")}`,
	async () => {
		const { ctx, rpc, base, variantId } =
			await setupBaseWithAnnualVariant("br_propagate");

		await rpc.plans.update<ApiPlanV1, RpcUpdate>(base.id, {
			name: "Pro Plus",
			items: [monthlyItem(500)],
			update_variant_ids: [variantId],
		});

		const baseFull = await getFull(ctx, base.id);
		const variantFull = await getFull(ctx, variantId);

		expect(baseFull.name).toBe("Pro Plus");
		expect(variantFull.name).toBe("Pro Annual");
		const variantMessages = variantFull.entitlements.find(
			(entitlement) => entitlement.feature_id === TestFeature.Messages,
		);
		expect(variantMessages?.allowance).toBe(500);
	},
);

test.concurrent(
	`${chalk.yellowBright("variants base rename: preview shows no variant name change")}`,
	async () => {
		const { rpc, base, variantId } =
			await setupBaseWithAnnualVariant("br_preview");

		const preview = (await rpc.post("/plans.preview_update", {
			plan_id: base.id,
			name: "Pro Plus",
			include_variants: true,
		})) as PlanUpdatePreview;

		expect(preview.previous_attributes).toMatchObject({ name: base.name });

		const variantPreview = preview.variants?.find(
			(variant) => variant.plan_id === variantId,
		);
		expect(variantPreview).toBeDefined();
		expect(variantPreview?.name).toBe("Pro Annual");
		expect(variantPreview?.previous_attributes ?? null).toBeNull();
	},
);
