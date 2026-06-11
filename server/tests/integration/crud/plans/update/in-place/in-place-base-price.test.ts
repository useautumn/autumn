/**
 * In-place plan update (disable_version) — changing the BASE PRICE must NOT
 * mutate the shared price row existing customers are billed on. The old base
 * price is retired (is_custom:true, Stripe price frozen); a new is_custom:false
 * base price (new Stripe price) is created for future customers.
 *
 * Guards a regression where the base price was excluded from the retire pass and
 * got upserted in place, changing existing customers' billing.
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
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { snapshotCustomerState } from "./utils/snapshotCustomerState";

type RpcInput = Omit<UpdatePlanParamsV2Input, "plan_id">;

const basePrice = async ({
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
	return product.prices.find((price) => price.config?.type === "fixed");
};

test(`${chalk.yellowBright("plans.update disable_version: base price change retires old price, existing customer billing unchanged")}`, async () => {
	const customerId = "plan-in-place-baseprice-existing";
	const newCustomerId = "plan-in-place-baseprice-new";
	const pro = products.pro({
		id: "pro_in_place_baseprice",
		items: [items.monthlyMessages({ includedUsage: 100 })],
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

	const oldPrice = await basePrice({ ctx, planId: pro.id });
	expect((oldPrice?.config as { amount?: number })?.amount).toBe(20);
	const before = await snapshotCustomerState({ ctx, customerId });

	// Change the base price 20 -> 30 in place.
	await autumnRpc.plans.update<ApiPlanV1, RpcInput>(pro.id, {
		disable_version: true,
		price: { amount: 30, interval: BillingInterval.Month },
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 100,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	// Catalog: a single is_custom:false base price with the NEW amount + a fresh id.
	const newPrice = await basePrice({ ctx, planId: pro.id });
	expect((newPrice?.config as { amount?: number })?.amount).toBe(30);
	expect(newPrice?.is_custom).toBe(false);
	expect(newPrice?.id).not.toBe(oldPrice?.id);

	// Existing customer: byte-identical (still references the retired price), and
	// their Stripe subscription is unchanged.
	expect(await snapshotCustomerState({ ctx, customerId })).toBe(before);
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	// New customer attaches against the new catalog (and gets the feature).
	await autumnV2_2.billing.attach({
		customer_id: newCustomerId,
		plan_id: pro.id,
	});
	const newCustomer =
		await autumnV2_2.customers.get<ApiCustomerV5>(newCustomerId);
	expectBalanceCorrect({
		customer: newCustomer,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
	});
});
