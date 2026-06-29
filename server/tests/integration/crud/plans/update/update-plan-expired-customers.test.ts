import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	CusProductStatus,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";

type RpcInput = Omit<UpdatePlanParamsV2Input, "plan_id">;

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const snapshotExpiredCustomerProduct = async ({
	ctx,
	customerId,
	planId,
}: {
	ctx: AutumnContext;
	customerId: string;
	planId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(candidate) =>
			candidate.product_id === planId &&
			candidate.status === CusProductStatus.Expired,
	);
	expect(customerProduct).toBeDefined();

	return JSON.stringify({
		id: customerProduct!.id,
		product_id: customerProduct!.product_id,
		status: customerProduct!.status,
		entity_id: customerProduct!.entity_id ?? null,
		options: customerProduct!.options,
		entitlements: customerProduct!.customer_entitlements
			.map((customerEntitlement) => ({
				entitlement_id: customerEntitlement.entitlement_id,
				balance: customerEntitlement.balance ?? null,
				unlimited: customerEntitlement.unlimited ?? null,
				next_reset_at: customerEntitlement.next_reset_at ?? null,
				entities: customerEntitlement.entities ?? null,
			}))
			.sort((a, b) => a.entitlement_id.localeCompare(b.entitlement_id)),
		prices: customerProduct!.customer_prices
			.map((customerPrice) => ({ price_id: customerPrice.price_id }))
			.sort((a, b) => (a.price_id ?? "").localeCompare(b.price_id ?? "")),
	});
};

const expireOnlyCustomerProduct = async ({
	autumnV1,
	customerId,
	planId,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	customerId: string;
	planId: string;
}) => {
	await autumnV1.subscriptions.update(
		{
			customer_id: customerId,
			product_id: planId,
			cancel_action: "cancel_immediately",
		},
		{ timeout: 2000 },
	);
};

const messagesEntAllowance = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const entitlement = product.entitlements.find(
		(candidate) => candidate.feature?.id === TestFeature.Messages,
	);
	return entitlement?.allowance;
};

test(`${chalk.yellowBright("plans.update: expired-only customers do not force versioning and keep customer shape")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const customerId = `plan-expired-update-${suffix}`;
	const productPrefix = `expired_update_${suffix}`;
	const pro = products.pro({
		id: "pro_expired_update",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const planId = `${pro.id}_${productPrefix}`;

	const { autumnV1, autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro], prefix: productPrefix }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await expireOnlyCustomerProduct({ autumnV1, customerId, planId });
	const before = await snapshotExpiredCustomerProduct({
		ctx,
		customerId,
		planId,
	});

	const preview = await autumnV2_3.plans.previewUpdate({
		plan_id: planId,
		price: { amount: 20, interval: BillingInterval.Month },
		items: [messagesItem(200)],
	});
	expect(preview.has_customers).toBe(false);
	expect(preview.versionable).toBe(false);

	const autumnRpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	await autumnRpc.plans.update<ApiPlanV1, RpcInput>(planId, {
		price: { amount: 20, interval: BillingInterval.Month },
		items: [messagesItem(200)],
	});

	const updated = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(updated.version).toBe(1);
	expect(await messagesEntAllowance({ ctx, planId })).toBe(200);
	expect(
		await snapshotExpiredCustomerProduct({ ctx, customerId, planId }),
	).toBe(before);
});

test(`${chalk.yellowBright("catalog.update: expired-only customers preview as non-versionable and keep customer shape")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const customerId = `catalog-expired-update-${suffix}`;
	const productPrefix = `catalog_expired_${suffix}`;
	const pro = products.pro({
		id: "catalog_expired_update",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const planId = `${pro.id}_${productPrefix}`;

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro], prefix: productPrefix }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await expireOnlyCustomerProduct({ autumnV1, customerId, planId });
	const before = await snapshotExpiredCustomerProduct({
		ctx,
		customerId,
		planId,
	});
	const planUpdate = {
		plan_id: planId,
		name: pro.name,
		price: { amount: 20, interval: BillingInterval.Month },
		items: [messagesItem(300)],
	};

	const preview = await autumnV2_2.catalog.previewUpdate({
		plans: [planUpdate],
	});
	expect(preview.plan_changes[0]).toMatchObject({
		plan_id: planId,
		has_customers: false,
		versionable: false,
	});

	await autumnV2_2.catalog.update({
		plans: [planUpdate],
	});

	const updated = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(updated.version).toBe(1);
	expect(await messagesEntAllowance({ ctx, planId })).toBe(300);
	expect(
		await snapshotExpiredCustomerProduct({ ctx, customerId, planId }),
	).toBe(before);
});
