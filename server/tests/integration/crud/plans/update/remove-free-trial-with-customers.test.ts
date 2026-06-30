/**
 * Removing a catalog free trial must preserve historical trial rows referenced by customer_products.
 * Red before fix: plans.update all_versions fails with the free_trials/customer_products FK violation.
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	customerProducts,
	freeTrials,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

type RpcInput = Omit<UpdatePlanParamsV2Input, "plan_id">;

test(`${chalk.yellowBright("plans.update all_versions: removes free trial without deleting referenced trial row")}`, async () => {
	const customerId = "plan-remove-trial-existing";
	const newCustomerId = "plan-remove-trial-new";
	const plan = products.proWithTrial({
		id: "pro_remove_trial_with_customers",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 7,
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
			s.otherCustomers([{ id: newCustomerId, paymentMethod: "success" }]),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	const customerProductBefore = await ctx.db.query.customerProducts.findFirst({
		where: eq(customerProducts.customer_id, customerId),
	});
	const trialId = customerProductBefore?.free_trial_id;
	expect(trialId).toBeDefined();

	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});

	await rpc.plans.update<ApiPlanV1, RpcInput>(plan.id, {
		all_versions: true,
		free_trial: null,
	});

	const updatedPlan = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: plan.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(updatedPlan.free_trial).toBeNull();

	const preservedTrial = await ctx.db.query.freeTrials.findFirst({
		where: eq(freeTrials.id, trialId!),
	});
	expect(preservedTrial?.is_custom).toBe(true);

	await autumnV2_2.billing.attach({
		customer_id: newCustomerId,
		plan_id: plan.id,
	});
	const newCustomerProduct = await ctx.db.query.customerProducts.findFirst({
		where: eq(customerProducts.customer_id, newCustomerId),
	});
	expect(newCustomerProduct?.free_trial_id).toBeNull();
});
