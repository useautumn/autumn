/**
 * In-place plan update (disable_version) — DELETE an existing entitlement on a
 * plan with existing customers. The old catalog ent is retired (is_custom:true)
 * because customers reference it (NOT cascade-deleted); the catalog no longer
 * exposes it, so future customers don't get it; existing customers keep it.
 *
 * Contract:
 *   - Catalog: deleted feature absent from getFull.
 *   - Existing customer: snapshot byte-identical (cusEnt NOT cascade-deleted).
 *   - New customer attaching after does NOT get the feature.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { snapshotCustomerState } from "./utils/snapshotCustomerState";

const catalogEnt = async ({
	ctx,
	planId,
	featureId,
}: {
	ctx: Parameters<typeof snapshotCustomerState>[0]["ctx"];
	planId: string;
	featureId: string;
}) => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return product.entitlements.find((ent) => ent.feature?.id === featureId);
};

test(`${chalk.yellowBright("plans.update disable_version: DELETE retires the ent, existing customer keeps it")}`, async () => {
	const customerId = "plan-in-place-delete-existing";
	const newCustomerId = "plan-in-place-delete-new";
	const pro = products.pro({
		id: "pro_in_place_delete",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			{ feature_id: TestFeature.AdminRights },
		],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.otherCustomers([{ id: newCustomerId, paymentMethod: "success" }]),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const autumnRpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});

	// Pre: existing customer has the flag; catalog has the ent.
	expect(
		await catalogEnt({
			ctx,
			planId: pro.id,
			featureId: TestFeature.AdminRights,
		}),
	).toBeDefined();
	const before = await snapshotCustomerState({ ctx, customerId });
	const existingBefore =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectFlagCorrect({
		customer: existingBefore,
		featureId: TestFeature.AdminRights,
		planId: pro.id,
		present: true,
	});

	// DELETE the AdminRights feature in place (keep Messages).
	await autumnRpc.plans.update<
		ApiPlanV1,
		Omit<UpdatePlanParamsV2Input, "plan_id">
	>(pro.id, {
		disable_version: true,
		price: { amount: 20, interval: BillingInterval.Month },
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 100,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	// Catalog: feature retired, gone from getFull.
	expect(
		await catalogEnt({
			ctx,
			planId: pro.id,
			featureId: TestFeature.AdminRights,
		}),
	).toBeUndefined();

	// Existing customer: byte-identical — cusEnt NOT cascade-deleted.
	const after = await snapshotCustomerState({ ctx, customerId });
	expect(after).toBe(before);
	const existingAfter =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectFlagCorrect({
		customer: existingAfter,
		featureId: TestFeature.AdminRights,
		planId: pro.id,
		present: true,
	});

	// New customer does NOT get the deleted feature.
	await autumnV2_2.billing.attach({
		customer_id: newCustomerId,
		plan_id: pro.id,
	});
	const newCustomer =
		await autumnV2_2.customers.get<ApiCustomerV5>(newCustomerId);
	expectFlagCorrect({
		customer: newCustomer,
		featureId: TestFeature.AdminRights,
		planId: pro.id,
		present: false,
	});
});
