import { describe, expect, test } from "bun:test";
import {
	BillingVersion,
	type CreateScheduleBillingContext,
	CusProductStatus,
	EntInterval,
	ms,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { entities } from "@tests/utils/fixtures/db/entities";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { computeCreateSchedulePlan } from "@/internal/billing/v2/actions/createSchedule/compute/computeCreateSchedulePlan";

const createPooledProduct = ({
	id,
	allowance,
}: {
	id: string;
	allowance: number;
}) => {
	const entitlement = {
		...entitlements.create({
			id: `entitlement_${id}`,
			featureId: "messages",
			featureName: "Messages",
			allowance,
			interval: EntInterval.Month,
		}),
		pooled: true,
	};
	return products.createFull({ id, entitlements: [entitlement] });
};

const createBillingContext = ({
	productContexts,
	immediatePhase,
	futurePhases = [],
	scheduledPhaseContexts = [],
	currentEpochMs = Date.now(),
}: Pick<CreateScheduleBillingContext, "productContexts" | "immediatePhase"> & {
	futurePhases?: CreateScheduleBillingContext["futurePhases"];
	scheduledPhaseContexts?: CreateScheduleBillingContext["scheduledPhaseContexts"];
	currentEpochMs?: number;
}): CreateScheduleBillingContext => {
	const fullProducts = productContexts.map(
		(productContext) => productContext.fullProduct,
	);
	const currentCustomerProducts = productContexts.flatMap((productContext) => [
		...(productContext.currentCustomerProduct
			? [productContext.currentCustomerProduct]
			: []),
		...(productContext.scheduledCustomerProduct
			? [productContext.scheduledCustomerProduct]
			: []),
	]);

	return {
		...contexts.createBilling({
			customerProducts: currentCustomerProducts,
			fullProducts,
			currentEpochMs,
			billingVersion: BillingVersion.V2,
		}),
		productContexts,
		featureQuantities: [],
		checkoutMode: null,
		customPrices: [],
		customEnts: [],
		isCustom: false,
		billingVersion: BillingVersion.V2,
		billingStartsAt: immediatePhase.starts_at,
		immediatePhase,
		futurePhases,
		scheduledPhaseContexts,
	};
};

describe(chalk.yellowBright("computeCreateSchedulePlan"), () => {
	test("creates immediate customer products for all first-phase plans", () => {
		const ctx = contexts.create({});
		const baseProduct = products.createFull({
			id: "base",
			prices: [prices.createFixed({ id: "price_base" })],
		});
		const addonProduct = products.createFull({
			id: "addon",
			isAddOn: true,
			prices: [prices.createFixed({ id: "price_addon" })],
		});

		const billingContext = createBillingContext({
			productContexts: [
				{
					fullProduct: baseProduct,
					customPrices: [],
					customEnts: [],
					featureQuantities: [],
				},
				{
					fullProduct: addonProduct,
					customPrices: [],
					customEnts: [],
					featureQuantities: [],
				},
			],
			immediatePhase: {
				starts_at: Date.now(),
				plans: [{ plan_id: baseProduct.id }, { plan_id: addonProduct.id }],
			},
		});

		const result = computeCreateSchedulePlan({
			ctx,
			billingContext,
		});

		expect(result.autumnBillingPlan.insertCustomerProducts).toHaveLength(2);
		expect(
			result.autumnBillingPlan.insertCustomerProducts.map(
				(product) => product.product_id,
			),
		).toEqual(["base", "addon"]);
		expect(
			result.autumnBillingPlan.insertCustomerProducts.every(
				(product) => product.status === CusProductStatus.Active,
			),
		).toBe(true);
		expect(result.autumnBillingPlan.updateCustomerProduct).toBeUndefined();
		expect(result.autumnBillingPlan.deleteCustomerProduct).toBeUndefined();
	});

	test("uses the immediate phase starts_at for first-phase customer products", () => {
		const ctx = contexts.create({});
		const currentEpochMs = 1_800_000_000_000;
		const startsAt = currentEpochMs - ms.days(35);
		const proProduct = products.createFull({
			id: "pro",
			prices: [prices.createFixed({ id: "price_pro" })],
		});

		const billingContext = createBillingContext({
			currentEpochMs,
			productContexts: [
				{
					fullProduct: proProduct,
					customPrices: [],
					customEnts: [],
					featureQuantities: [],
				},
			],
			immediatePhase: {
				starts_at: startsAt,
				plans: [{ plan_id: proProduct.id }],
			},
		});

		const result = computeCreateSchedulePlan({
			ctx,
			billingContext,
		});

		expect(result.autumnBillingPlan.insertCustomerProducts).toHaveLength(1);
		expect(result.autumnBillingPlan.insertCustomerProducts[0]!.status).toBe(
			CusProductStatus.Active,
		);
		expect(result.autumnBillingPlan.insertCustomerProducts[0]!.starts_at).toBe(
			startsAt,
		);
	});

	test("expires the current product and removes a scheduled replacement during a transition", () => {
		const ctx = contexts.create({});
		const currentEpochMs = 1_000_000;
		const oldProduct = products.createFull({
			id: "starter",
			prices: [prices.createFixed({ id: "price_starter" })],
		});
		const newProduct = products.createFull({
			id: "pro",
			prices: [prices.createFixed({ id: "price_pro" })],
		});
		const currentCustomerProduct = customerProducts.create({
			id: "cus_prod_current",
			productId: oldProduct.id,
			product: oldProduct,
			status: CusProductStatus.Active,
			customerPrices: [
				prices.createCustomer({
					price: oldProduct.prices[0]!,
					customerProductId: "cus_prod_current",
				}),
			],
		});
		const scheduledCustomerProduct = customerProducts.create({
			id: "cus_prod_scheduled",
			productId: "legacy_scheduled",
			product: products.createFull({
				id: "legacy_scheduled",
				prices: [prices.createFixed({ id: "price_legacy_scheduled" })],
			}),
			status: CusProductStatus.Scheduled,
		});

		const billingContext = createBillingContext({
			currentEpochMs,
			productContexts: [
				{
					fullProduct: newProduct,
					customPrices: [],
					customEnts: [],
					featureQuantities: [],
					currentCustomerProduct,
					scheduledCustomerProduct,
				},
			],
			immediatePhase: {
				starts_at: currentEpochMs,
				plans: [{ plan_id: newProduct.id }],
			},
		});

		const result = computeCreateSchedulePlan({
			ctx,
			billingContext,
		});

		expect(result.autumnBillingPlan.insertCustomerProducts).toHaveLength(1);
		expect(result.autumnBillingPlan.insertCustomerProducts[0]!.product_id).toBe(
			"pro",
		);
		expect(result.autumnBillingPlan.deleteCustomerProducts).toHaveLength(1);
		expect(result.autumnBillingPlan.deleteCustomerProducts?.[0]?.id).toBe(
			"cus_prod_scheduled",
		);
		expect(result.autumnBillingPlan.updateCustomerProducts).toHaveLength(1);
		expect(
			result.autumnBillingPlan.updateCustomerProducts?.[0]?.customerProduct.id,
		).toBe("cus_prod_current");
		expect(
			result.autumnBillingPlan.updateCustomerProducts?.[0]?.updates.status,
		).toBe(CusProductStatus.Expired);
		expect(
			result.autumnBillingPlan.updateCustomerProducts?.[0]?.updates.ended_at,
		).toBe(currentEpochMs);
		expect(
			result.autumnBillingPlan.updateCustomerProducts?.[0]?.updates.canceled,
		).toBe(true);
	});

	test("marks scheduled phase products to reset Stripe billing anchor at phase start", () => {
		const ctx = contexts.create({});
		const currentEpochMs = 1_800_000_000_000;
		const phaseStartsAt = currentEpochMs + ms.days(30);
		const currentProduct = products.createFull({
			id: "starter",
			prices: [prices.createFixed({ id: "price_starter" })],
		});
		const scheduledProduct = products.createFull({
			id: "quarterly",
			prices: [prices.createFixed({ id: "price_quarterly" })],
		});
		const currentCustomerProduct = customerProducts.create({
			id: "cus_prod_current",
			productId: currentProduct.id,
			product: currentProduct,
			status: CusProductStatus.Active,
			customerPrices: [
				prices.createCustomer({
					price: currentProduct.prices[0]!,
					customerProductId: "cus_prod_current",
				}),
			],
		});

		const billingContext = createBillingContext({
			currentEpochMs,
			productContexts: [
				{
					fullProduct: currentProduct,
					customPrices: [],
					customEnts: [],
					featureQuantities: [],
					currentCustomerProduct,
				},
			],
			immediatePhase: {
				starts_at: currentEpochMs,
				plans: [{ plan_id: currentProduct.id }],
			},
			futurePhases: [
				{
					starts_at: phaseStartsAt,
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: scheduledProduct.id }],
				} as CreateScheduleBillingContext["futurePhases"][number],
			],
			scheduledPhaseContexts: [
				{
					startsAt: phaseStartsAt,
					endsAt: undefined,
					billingCycleAnchor: "phase_start",
					productContexts: [
						{
							fullProduct: scheduledProduct,
							customPrices: [],
							customEntitlements: [],
							featureQuantities: [],
						},
					],
				} as CreateScheduleBillingContext["scheduledPhaseContexts"][number],
			],
		});

		const result = computeCreateSchedulePlan({ ctx, billingContext });
		const scheduledCustomerProduct =
			result.autumnBillingPlan.insertCustomerProducts.find(
				(customerProduct) => customerProduct.product_id === scheduledProduct.id,
			);

		expect(scheduledCustomerProduct?.billing_cycle_anchor_resets_at).toBe(
			phaseStartsAt,
		);
	});

	test("prepares immediate and future pooled sources in one schedule plan", () => {
		const ctx = contexts.create({});
		const currentEpochMs = 1_800_000_000_000;
		const phaseStartsAt = currentEpochMs + ms.days(30);
		const entity = entities.create({
			id: "entity_one",
			featureId: "seats",
		});
		const currentProduct = createPooledProduct({
			id: "pooled_starter",
			allowance: 100,
		});
		const immediateProduct = createPooledProduct({
			id: "pooled_pro",
			allowance: 500,
		});
		const futureProduct = createPooledProduct({
			id: "pooled_premium",
			allowance: 900,
		});
		const currentCustomerEntitlement = customerEntitlements.create({
			id: "customer_entitlement_current",
			entitlementId: currentProduct.entitlements[0]!.id,
			featureId: "messages",
			featureName: "Messages",
			allowance: 100,
			balance: 100,
			customerProductId: "customer_product_current",
			interval: EntInterval.Month,
			nextResetAt: currentEpochMs + ms.days(30),
		});
		currentCustomerEntitlement.entitlement = currentProduct.entitlements[0]!;
		currentCustomerEntitlement.reset_cycle_anchor = currentEpochMs;
		const currentCustomerProduct = customerProducts.create({
			id: "customer_product_current",
			productId: currentProduct.id,
			product: currentProduct,
			customerEntitlements: [currentCustomerEntitlement],
			internalEntityId: entity.internal_id,
			entityId: entity.id ?? undefined,
			status: CusProductStatus.Active,
			startsAt: currentEpochMs,
		});

		const billingContext = createBillingContext({
			currentEpochMs,
			productContexts: [
				{
					fullProduct: immediateProduct,
					customPrices: [],
					customEnts: [],
					featureQuantities: [],
					currentCustomerProduct,
				},
			],
			immediatePhase: {
				starts_at: currentEpochMs,
				plans: [{ plan_id: immediateProduct.id }],
			},
			futurePhases: [
				{
					starts_at: phaseStartsAt,
					plans: [{ plan_id: futureProduct.id }],
				} as CreateScheduleBillingContext["futurePhases"][number],
			],
			scheduledPhaseContexts: [
				{
					startsAt: phaseStartsAt,
					endsAt: undefined,
					productContexts: [
						{
							fullProduct: futureProduct,
							customPrices: [],
							customEntitlements: [],
							featureQuantities: [],
						},
					],
				},
			],
		});
		billingContext.fullCustomer.entity = entity;
		billingContext.fullCustomer.entities = [entity];

		const result = computeCreateSchedulePlan({ ctx, billingContext });
		const immediateCustomerProduct =
			result.autumnBillingPlan.insertCustomerProducts.find(
				(customerProduct) => customerProduct.product_id === immediateProduct.id,
			);
		const futureCustomerProduct =
			result.autumnBillingPlan.insertCustomerProducts.find(
				(customerProduct) => customerProduct.product_id === futureProduct.id,
			);

		expect(immediateCustomerProduct?.customer_entitlements[0]?.balance).toBe(0);
		expect(futureCustomerProduct?.customer_entitlements[0]?.balance).toBe(0);
		expect(result.autumnBillingPlan.pooledBalanceOps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					op: "remove_source",
					sourceCustomerProductId: currentCustomerProduct.id,
				}),
				expect.objectContaining({
					op: "upsert_source",
					sourceCustomerProductId: immediateCustomerProduct?.id,
					currentCycleContribution: 500,
				}),
			]),
		);
		expect(
			result.autumnBillingPlan.pooledBalanceOps?.some(
				(operation) =>
					operation.op === "upsert_source" &&
					operation.sourceCustomerProductId === futureCustomerProduct?.id,
			),
		).toBe(false);
	});
});
