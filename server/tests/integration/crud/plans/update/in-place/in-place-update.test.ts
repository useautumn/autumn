/**
 * In-place plan update (disable_version) — UPDATE an existing entitlement
 * (allowance change) on a plan with existing customers. The old catalog ent is
 * retired (is_custom:true), a new is_custom:false ent carries the new
 * definition; existing customers keep referencing the retired ent (unchanged);
 * future customers get the new one.
 *
 * Contract:
 *   - Catalog: old ent absent from getFull, new ent present with new allowance.
 *   - Existing customer: snapshot byte-identical (same entitlement_id + balance),
 *     no extra invoice.
 *   - New customer attaching after gets the new allowance.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { snapshotCustomerState } from "./utils/snapshotCustomerState";

const messagesEnt = async ({
	ctx,
	planId,
}: {
	ctx: Parameters<typeof snapshotCustomerState>[0]["ctx"];
	planId: string;
}) => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return product.entitlements.find(
		(ent) => ent.feature?.id === TestFeature.Messages,
	);
};

test(`${chalk.yellowBright("plans.update disable_version: UPDATE retires old ent, existing customer unchanged")}`, async () => {
	const customerId = "plan-in-place-update-existing";
	const newCustomerId = "plan-in-place-update-new";
	const pro = products.pro({
		id: "pro_in_place_update",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
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

	const oldEnt = await messagesEnt({ ctx, planId: pro.id });
	expect(oldEnt?.allowance).toBe(100);
	const before = await snapshotCustomerState({ ctx, customerId });

	// UPDATE allowance 100 -> 200 in place.
	await autumnRpc.plans.update<
		ApiPlanV1,
		Omit<UpdatePlanParamsV2Input, "plan_id">
	>(pro.id, {
		disable_version: true,
		price: { amount: 20, interval: BillingInterval.Month },
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 200,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	// Catalog: a single is_custom:false Messages ent with the NEW allowance.
	const newEnt = await messagesEnt({ ctx, planId: pro.id });
	expect(newEnt?.allowance).toBe(200);
	expect(newEnt?.is_custom).toBe(false);
	expect(newEnt?.id).not.toBe(oldEnt?.id);

	// Existing customer: byte-identical (still references the retired ent), no charge.
	const after = await snapshotCustomerState({ ctx, customerId });
	expect(after).toBe(before);
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
	});

	// New customer gets the new allowance.
	await autumnV2_2.billing.attach({
		customer_id: newCustomerId,
		plan_id: pro.id,
	});
	const newCustomer =
		await autumnV2_2.customers.get<ApiCustomerV5>(newCustomerId);
	expectBalanceCorrect({
		customer: newCustomer,
		featureId: TestFeature.Messages,
		remaining: 200,
		usage: 0,
		planId: pro.id,
	});
});
