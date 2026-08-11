/**
 * Contract for expireCustomerProductAndActivateDefault's webhook wiring:
 * - products_updated (Expired) is enqueued BEFORE successor activation.
 * - Without a collector the action emits billing.updated itself.
 * - With a collector it only records, leaving the flush to the caller.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { mockModuleWithRestore } from "@tests/unit/utils/mockModuleWithRestore";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { createBillingChangeCollector } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/billingChangeCollector";

const calls: string[] = [];
const sentBillingPlans: AutumnBillingPlan[] = [];

const expiringCustomerProduct = {
	id: "cus_prod_expiring",
	internal_customer_id: "internal_cus_1",
	product: { name: "Pro", group: "main" },
} as unknown as FullCusProduct;

const activatedCustomerProduct = {
	id: "cus_prod_free",
	internal_customer_id: "internal_cus_1",
	product: { name: "Free", group: "main" },
} as unknown as FullCusProduct;

await mockModuleWithRestore(
	"@/internal/analytics/handlers/handleProductsUpdated",
	() => ({
		addProductsUpdatedWebhookTask: async ({
			scenario,
		}: {
			scenario: string;
		}) => {
			calls.push(`products_updated:${scenario}`);
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cusProducts/actions/activateFreeSuccessorProduct",
	() => ({
		activateFreeSuccessorProduct: async () => {
			calls.push("activate_successor");
			return { activatedCustomerProduct, insertedCustomerProduct: undefined };
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/execute/executeAutumnBillingPlan.js",
	() => ({
		executeAutumnBillingPlan: async () => {},
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook",
	() => ({
		sendBillingUpdatedWebhook: async ({
			autumnBillingPlan,
		}: {
			autumnBillingPlan: AutumnBillingPlan;
		}) => {
			sentBillingPlans.push(autumnBillingPlan);
		},
	}),
);

const { expireCustomerProductAndActivateDefault } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/cusProducts/actions/expireAndActivateDefault?expireEmission"
);

const buildContext = () =>
	({
		org: { id: "org_1" },
		env: "sandbox",
		logger: { debug: () => {}, info: () => {} },
	}) as unknown as AutumnContext;

const buildFullCustomer = (): FullCustomer =>
	({
		id: "customer_1",
		internal_id: "internal_cus_1",
		customer_products: [expiringCustomerProduct, activatedCustomerProduct],
	}) as unknown as FullCustomer;

describe("expireCustomerProductAndActivateDefault emission", () => {
	beforeEach(() => {
		calls.length = 0;
		sentBillingPlans.length = 0;
	});

	test("enqueues products_updated (Expired) before activating the successor", async () => {
		await expireCustomerProductAndActivateDefault({
			ctx: buildContext(),
			customerProduct: expiringCustomerProduct,
			fullCustomer: buildFullCustomer(),
		});

		expect(calls.slice(0, 2)).toEqual([
			"products_updated:expired",
			"activate_successor",
		]);
	});

	test("emits billing.updated itself when no collector is passed", async () => {
		await expireCustomerProductAndActivateDefault({
			ctx: buildContext(),
			customerProduct: expiringCustomerProduct,
			fullCustomer: buildFullCustomer(),
		});

		expect(sentBillingPlans).toHaveLength(1);

		const updates = sentBillingPlans[0].updateCustomerProducts ?? [];
		expect(updates.map((update) => update.customerProduct.id)).toEqual([
			expiringCustomerProduct.id,
			activatedCustomerProduct.id,
		]);
		expect(updates[0].updates.status).toBe(CusProductStatus.Expired);
		expect(updates[1].updates.status).toBe(CusProductStatus.Active);
	});

	test("records onto the collector instead of emitting when one is passed", async () => {
		const fullCustomer = buildFullCustomer();
		const collector = createBillingChangeCollector({ fullCustomer });

		await expireCustomerProductAndActivateDefault({
			ctx: buildContext(),
			customerProduct: expiringCustomerProduct,
			fullCustomer,
			collector,
		});

		expect(sentBillingPlans).toHaveLength(0);
		expect(
			collector.updatedCustomerProducts.map(
				(update) => update.customerProduct.id,
			),
		).toEqual([expiringCustomerProduct.id, activatedCustomerProduct.id]);
		expect(collector.updatedCustomerProducts[0].updates.status).toBe(
			CusProductStatus.Expired,
		);
		expect(collector.updatedCustomerProducts[1].updates.status).toBe(
			CusProductStatus.Active,
		);
	});
});
