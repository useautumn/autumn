/**
 * In-place plan update (disable_version) — ADD entitlement-only on a plan with
 * existing customers. The catalog gains the new item; existing customers are
 * left untouched; future customers inherit it.
 *
 * Contract under test:
 *   C1 catalog: getFull(planId) includes the new ent (is_custom:false), version unchanged.
 *   C2 existing customer UNCHANGED: same customer_entitlements (entitlement_id set,
 *      balances) and customer_prices; no new cusEnt for the added feature.
 *   C3 existing customer does NOT get the new flag.
 *   C4 no extra invoice for the existing customer.
 *   C5 a NEW customer attaching after the update inherits the feature.
 *   C6 disable_version is reachable via the V2 plans.update RPC.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";

type UpdatePlanRpcInput = Omit<UpdatePlanParamsV2Input, "plan_id">;

const getCatalogEnt = async ({
	ctx,
	planId,
	featureId,
}: {
	ctx: Parameters<typeof CusService.getFull>[0]["ctx"];
	planId: string;
	featureId: string;
}) => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return {
		ent: product.entitlements.find((entry) => entry.feature?.id === featureId),
		version: product.version,
	};
};

const snapshotCustomerItems = async ({
	ctx,
	customerId,
}: {
	ctx: Parameters<typeof CusService.getFull>[0]["ctx"];
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const cusProduct = fullCustomer.customer_products[0];
	return {
		entitlementIds: cusProduct.customer_entitlements
			.map((entry) => entry.entitlement_id)
			.sort(),
		balances: cusProduct.customer_entitlements
			.map((entry) => ({
				entitlement_id: entry.entitlement_id,
				balance: entry.balance,
				next_reset_at: entry.next_reset_at,
			}))
			.sort((a, b) => a.entitlement_id.localeCompare(b.entitlement_id)),
		priceIds: cusProduct.customer_prices.map((entry) => entry.price_id).sort(),
	};
};

test(`${chalk.yellowBright("plans.update disable_version: ADD entitlement-only keeps existing customers unchanged")}`, async () => {
	const customerId = "plan-in-place-add-existing";
	const newCustomerId = "plan-in-place-add-new";
	const pro = products.pro({
		id: "pro_in_place_add",
		items: [itemsV2.dashboard()],
	});
	const adminRights = { feature_id: TestFeature.AdminRights };

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

	// Pre: catalog lacks the added feature; snapshot existing customer.
	expect(
		(
			await getCatalogEnt({
				ctx,
				planId: pro.id,
				featureId: TestFeature.AdminRights,
			})
		).ent,
	).toBeUndefined();
	const before = await snapshotCustomerItems({ ctx, customerId });

	// C6: disable_version travels through the V2 RPC body.
	await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(pro.id, {
		disable_version: true,
		price: { amount: 20, interval: BillingInterval.Month },
		items: [itemsV2.dashboard(), adminRights],
	});

	// C1: catalog updated in place (new ent, same version).
	const { ent: addedEnt, version: afterVersion } = await getCatalogEnt({
		ctx,
		planId: pro.id,
		featureId: TestFeature.AdminRights,
	});
	expect(addedEnt).toBeDefined();
	expect(addedEnt?.is_custom).toBe(false);
	expect(afterVersion).toBe(1);

	// C2: existing customer's rows are byte-identical.
	const after = await snapshotCustomerItems({ ctx, customerId });
	expect(after.entitlementIds).toEqual(before.entitlementIds);
	expect(after.balances).toEqual(before.balances);
	expect(after.priceIds).toEqual(before.priceIds);

	// C3: existing customer did NOT gain the flag.
	const existingCustomer =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectFlagCorrect({
		customer: existingCustomer,
		featureId: TestFeature.AdminRights,
		planId: pro.id,
		present: false,
	});

	// C4: no extra invoice for the existing customer.
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
	});

	// C5: a customer attaching AFTER the update inherits the new feature.
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
		present: true,
	});
});
