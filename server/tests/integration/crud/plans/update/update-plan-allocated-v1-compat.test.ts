// Contract: new allocated usage-based API items default arrear; explicit IDs preserve v1.
// Green: dashboard/V2 config can explicitly migrate existing allocated-v1 to arrear.

import { expect, test } from "bun:test";
import {
	AllocatedBillingBehavior,
	type ApiCustomerV3,
	type ApiPlanV1,
	ApiVersion,
	type AttachParamsV1Input,
	BillingInterval,
	BillingMethod,
	type CreatePlanItemParamsV1,
	type CreatePlanParamsV2Input,
	findPriceByFeatureId,
	mapToProductV2,
	type ProductItem,
	type UpdatePlanParamsV2Input,
	type UsagePriceConfig,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

type RpcUpdateInput = Omit<UpdatePlanParamsV2Input, "plan_id">;
type TestCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const allocatedUsersApiItem = ({
	included = 1,
}: {
	included?: number;
} = {}): CreatePlanItemParamsV1 => ({
	feature_id: TestFeature.Users,
	included,
	price: {
		amount: 10,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
		billing_units: 1,
	},
});

const getFullPlan = async ({ ctx, planId }: { ctx: TestCtx; planId: string }) =>
	await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

const getUsersPrice = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const fullProduct = await getFullPlan({ ctx, planId });
	const price = findPriceByFeatureId({
		prices: fullProduct.prices,
		featureId: TestFeature.Users,
	});
	if (!price) throw new Error("Users price not found");
	return price;
};

const getUsersIds = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const fullProduct = await getFullPlan({ ctx, planId });
	const price = findPriceByFeatureId({
		prices: fullProduct.prices,
		featureId: TestFeature.Users,
	});
	const entitlement = fullProduct.entitlements.find(
		(ent) => ent.feature_id === TestFeature.Users,
	);
	if (!price || !entitlement)
		throw new Error("Users price/entitlement not found");

	return {
		priceId: price.id,
		entitlementId: entitlement.id,
	};
};

const getUsersProductItem = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const fullProduct = await getFullPlan({ ctx, planId });
	const productV2 = mapToProductV2({
		product: fullProduct,
		features: ctx.features,
	});
	const item = productV2.items.find(
		(item) => item.feature_id === TestFeature.Users,
	);
	if (!item) throw new Error("Users product item not found");
	return item;
};

const forceOldAllocatedV1Config = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const price = await getUsersPrice({ ctx, planId });
	const { allocated_billing_behavior: _allocatedBillingBehavior, ...config } =
		price.config as UsagePriceConfig;

	await PriceService.update({
		db: ctx.db,
		id: price.id,
		update: {
			config: {
				...config,
				should_prorate: true,
			},
		},
	});
};

const expectAllocatedV1Price = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const price = await getUsersPrice({ ctx, planId });
	const config = price.config as UsagePriceConfig;
	expect(config.should_prorate).toBe(true);
	expect(config.allocated_billing_behavior).not.toBe(
		AllocatedBillingBehavior.Arrear,
	);
	expect(price.proration_config).not.toBeNull();
};

const expectAllocatedV2Price = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const price = await getUsersPrice({ ctx, planId });
	const config = price.config as UsagePriceConfig;
	expect(config.should_prorate).toBe(false);
	expect(config.allocated_billing_behavior).toBe(
		AllocatedBillingBehavior.Arrear,
	);
	expect(price.proration_config).toBeNull();
};

test.concurrent(
	`${chalk.yellowBright("plans.create: allocated usage-based defaults to arrear")}`,
	async () => {
		const customerId = "allocated-api-create-default-arrear";
		const planId = "allocated_api_create_default_arrear";
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});
		const autumnRpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_3,
		});

		try {
			await autumnRpc.plans.delete(planId, { allVersions: true });
		} catch (_error) {}

		await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
			plan_id: planId,
			name: "Allocated API Create Default Arrear",
			group: planId,
			items: [allocatedUsersApiItem()],
		});

		await expectAllocatedV2Price({ ctx, planId });
	},
);

test.concurrent(
	`${chalk.yellowBright("plans.update: explicit IDs preserve allocated v1")}`,
	async () => {
		const customerId = "update-plan-allocated-v1-explicit";
		const pro = products.pro({
			id: "update_plan_allocated_v1_explicit",
			items: [items.allocatedUsers({ includedUsage: 1 })],
		});

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});
		const autumnRpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_3,
		});

		await forceOldAllocatedV1Config({ ctx, planId: pro.id });
		const { entitlementId, priceId } = await getUsersIds({
			ctx,
			planId: pro.id,
		});

		await autumnRpc.plans.update<ApiPlanV1, RpcUpdateInput>(pro.id, {
			items: [
				{
					...allocatedUsersApiItem(),
					entitlement_id: entitlementId,
					price_id: priceId,
				},
			],
		});

		await expectAllocatedV1Price({ ctx, planId: pro.id });

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 2,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestInvoiceProductId: pro.id,
		});
		expect(customer.invoices?.[0]?.total).toBeGreaterThan(0);
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("products.update: explicit arrear config migrates allocated v1")}`,
	async () => {
		const customerId = "update-plan-allocated-v1-to-arrear";
		const pro = products.pro({
			id: "update_plan_allocated_v1_to_arrear",
			items: [items.allocatedUsers({ includedUsage: 1 })],
		});

		const { autumnV1Beta, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await forceOldAllocatedV1Config({ ctx, planId: pro.id });
		await expectAllocatedV1Price({ ctx, planId: pro.id });

		const usersItem = await getUsersProductItem({ ctx, planId: pro.id });
		const arrearUsersItem: ProductItem = {
			...usersItem,
			config: {
				...usersItem.config,
				allocated_billing_behavior: AllocatedBillingBehavior.Arrear,
				on_increase: undefined,
				on_decrease: undefined,
			},
		};

		await autumnV1Beta.products.update(pro.id, {
			items: [arrearUsersItem],
		});

		await expectAllocatedV2Price({ ctx, planId: pro.id });
	},
);
