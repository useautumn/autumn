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

	await autumnRpc.plans.update<ApiPlanV1, UpdatePlanRpcInput>(pro.id, {
		disable_version: true,
		price: { amount: 20, interval: BillingInterval.Month },
		items: [itemsV2.dashboard(), adminRights],
	});

	const { ent: addedEnt, version: afterVersion } = await getCatalogEnt({
		ctx,
		planId: pro.id,
		featureId: TestFeature.AdminRights,
	});
	expect(addedEnt).toBeDefined();
	expect(addedEnt?.is_custom).toBe(false);
	expect(afterVersion).toBe(1);

	const after = await snapshotCustomerItems({ ctx, customerId });
	expect(after.entitlementIds).toEqual(before.entitlementIds);
	expect(after.balances).toEqual(before.balances);
	expect(after.priceIds).toEqual(before.priceIds);

	const existingCustomer =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectFlagCorrect({
		customer: existingCustomer,
		featureId: TestFeature.AdminRights,
		planId: pro.id,
		present: false,
	});

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
	});

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
