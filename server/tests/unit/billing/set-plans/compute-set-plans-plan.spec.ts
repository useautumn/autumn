import { describe, expect, test } from "bun:test";
import {
	BillingVersion,
	type CreateScheduleBillingContext,
	CusProductStatus,
	type Entity,
	type FullCusProduct,
	type MultiAttachProductContext,
	ms,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import type Stripe from "stripe";
import { phaseResetsBillingCycle } from "@/internal/billing/v2/actions/generateRequest/setup/phaseResetsBillingCycle";
import { handleSetPlansComputeErrors } from "@/internal/billing/v2/actions/setPlans/errors/handleSetPlansErrors";
import { deferredSetPlansSchedulePhases } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";
import { computeSetPlansPlanFromContext } from "./setPlansTimelineHelpers";

const createBillingContext = ({
	productContexts,
	immediatePhase,
	futurePhases = [],
	scheduledPhaseContexts = [],
	currentEpochMs = Date.now(),
}: {
	productContexts: Array<
		Omit<MultiAttachProductContext, "fullCustomer"> & {
			entity?: Entity;
			scopeCustomerProducts: FullCusProduct[];
		}
	>;
	immediatePhase: CreateScheduleBillingContext["immediatePhase"];
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

	const billingContext = contexts.createBilling({
		customerProducts: currentCustomerProducts,
		fullProducts,
		currentEpochMs,
		billingVersion: BillingVersion.V2,
	});
	const scopedProductContexts = productContexts.map(
		({ entity, scopeCustomerProducts, ...productContext }) => ({
			...productContext,
			fullCustomer: {
				...billingContext.fullCustomer,
				entity,
				customer_products: scopeCustomerProducts,
			},
		}),
	);

	return {
		...billingContext,
		productContexts: scopedProductContexts,
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

describe(chalk.yellowBright("computeSetPlansPlan"), () => {
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
					scopeCustomerProducts: [],
				},
				{
					fullProduct: addonProduct,
					customPrices: [],
					customEnts: [],
					featureQuantities: [],
					scopeCustomerProducts: [],
				},
			],
			immediatePhase: {
				starts_at: Date.now(),
				plans: [{ plan_id: baseProduct.id }, { plan_id: addonProduct.id }],
			},
		});

		const result = computeSetPlansPlanFromContext({
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
					scopeCustomerProducts: [],
				},
			],
			immediatePhase: {
				starts_at: startsAt,
				plans: [{ plan_id: proProduct.id }],
			},
		});

		const result = computeSetPlansPlanFromContext({
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
					scopeCustomerProducts: [
						currentCustomerProduct,
						scheduledCustomerProduct,
					],
					currentCustomerProduct,
					scheduledCustomerProduct,
				},
			],
			immediatePhase: {
				starts_at: currentEpochMs,
				plans: [{ plan_id: newProduct.id }],
			},
		});

		const result = computeSetPlansPlanFromContext({
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
					scopeCustomerProducts: [currentCustomerProduct],
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

		const result = computeSetPlansPlanFromContext({ ctx, billingContext });
		const scheduledCustomerProduct =
			result.autumnBillingPlan.insertCustomerProducts.find(
				(customerProduct) => customerProduct.product_id === scheduledProduct.id,
			);

		expect(scheduledCustomerProduct?.billing_cycle_anchor_resets_at).toBe(
			phaseStartsAt,
		);
	});
});

describe(
	chalk.yellowBright("computeSetPlansPlan: replaced subscriptions"),
	() => {
		test("a plan on a paused subscription is not credited, since Stripe never collected its period", () => {
			const ctx = contexts.create({});
			const currentEpochMs = 1_800_000_000_000;
			const pausedSubscription = {
				id: "sub_paused",
				status: "paused",
			} as Stripe.Subscription;
			const starter = products.createFull({
				id: "starter",
				prices: [prices.createFixed({ id: "price_starter" })],
			});
			const pro = products.createFull({
				id: "pro",
				prices: [prices.createFixed({ id: "price_pro" })],
			});
			const starterCustomerProduct = customerProducts.create({
				id: "cus_prod_starter",
				productId: starter.id,
				product: starter,
				subscriptionIds: [pausedSubscription.id],
				startsAt: currentEpochMs - ms.days(1),
				customerPrices: [
					prices.createCustomer({
						price: starter.prices[0]!,
						customerProductId: "cus_prod_starter",
					}),
				],
			});

			const billingContext = {
				...createBillingContext({
					currentEpochMs,
					productContexts: [
						{
							fullProduct: pro,
							customPrices: [],
							customEnts: [],
							featureQuantities: [],
							scopeCustomerProducts: [starterCustomerProduct],
							currentCustomerProduct: starterCustomerProduct,
						},
					],
					immediatePhase: {
						starts_at: currentEpochMs,
						plans: [{ plan_id: pro.id }],
					},
				}),
				replacedStripeSubscription: pausedSubscription,
			};

			const { autumnBillingPlan } = computeSetPlansPlanFromContext({
				ctx,
				billingContext,
			});

			expect(
				(autumnBillingPlan.lineItems ?? []).filter(
					(lineItem) =>
						lineItem.context.customerProduct?.id === starterCustomerProduct.id,
				),
			).toEqual([]);
			expect(
				(autumnBillingPlan.lineItems ?? []).some(
					(lineItem) => lineItem.context.customerProduct?.product_id === pro.id,
				),
			).toBe(true);
		});
	},
);

const proWithCustomerProduct = ({
	subscriptionIds = [],
}: {
	subscriptionIds?: string[];
} = {}) => {
	const pro = products.createFull({
		id: "pro",
		prices: [prices.createFixed({ id: "price_pro" })],
	});
	const customerProduct = customerProducts.create({
		id: "cus_prod_pro",
		productId: pro.id,
		product: pro,
		subscriptionIds,
		customerPrices: [
			prices.createCustomer({
				price: pro.prices[0]!,
				customerProductId: "cus_prod_pro",
			}),
		],
	});
	return { pro, customerProduct };
};

const requestProductContext = ({
	fullProduct,
	currentCustomerProduct,
}: {
	fullProduct: MultiAttachProductContext["fullProduct"];
	currentCustomerProduct?: FullCusProduct;
}) => ({
	fullProduct,
	customPrices: [],
	customEnts: [],
	featureQuantities: [],
	scopeCustomerProducts: currentCustomerProduct ? [currentCustomerProduct] : [],
	currentCustomerProduct,
});

const cancelledSubscription = {
	id: "sub_dead",
	status: "canceled",
} as Stripe.Subscription;

describe(chalk.yellowBright("computeSetPlansPlan: unchanged plans"), () => {
	test("an identical plan on a live subscription is left untouched", () => {
		const ctx = contexts.create({});
		const currentEpochMs = 1_800_000_000_000;
		const { pro, customerProduct } = proWithCustomerProduct({
			subscriptionIds: ["sub_live"],
		});

		const billingContext = createBillingContext({
			currentEpochMs,
			productContexts: [
				requestProductContext({
					fullProduct: pro,
					currentCustomerProduct: customerProduct,
				}),
			],
			immediatePhase: {
				starts_at: currentEpochMs,
				plans: [{ plan_id: pro.id }],
			},
		});

		const { autumnBillingPlan, phases, immediatePhaseTransition } =
			computeSetPlansPlanFromContext({ ctx, billingContext });

		expect(autumnBillingPlan.insertCustomerProducts).toEqual([]);
		expect(autumnBillingPlan.updateCustomerProducts).toEqual([]);
		expect(autumnBillingPlan.patchCustomerProducts).toBeUndefined();
		expect(phases[0]?.customerProductIds).toEqual([customerProduct.id]);
		expect(immediatePhaseTransition.outgoingCustomerProducts).toEqual([]);
		expect(
			immediatePhaseTransition.keptCustomerProducts.map(({ id }) => id),
		).toEqual([customerProduct.id]);
	});

	test("an identical plan on a cancelled subscription only moves onto the new one", () => {
		const ctx = contexts.create({});
		const currentEpochMs = 1_800_000_000_000;
		const { pro, customerProduct } = proWithCustomerProduct({
			subscriptionIds: [cancelledSubscription.id],
		});

		const billingContext = {
			...createBillingContext({
				currentEpochMs,
				productContexts: [
					requestProductContext({
						fullProduct: pro,
						currentCustomerProduct: customerProduct,
					}),
				],
				immediatePhase: {
					starts_at: currentEpochMs,
					plans: [{ plan_id: pro.id }],
				},
			}),
			replacedStripeSubscription: cancelledSubscription,
		};

		const { autumnBillingPlan, phases } = computeSetPlansPlanFromContext({
			ctx,
			billingContext,
		});

		expect(autumnBillingPlan.insertCustomerProducts).toEqual([]);
		expect(
			autumnBillingPlan.updateCustomerProducts?.map(
				({ customerProduct, updates }) => ({ id: customerProduct.id, updates }),
			),
		).toEqual([{ id: customerProduct.id, updates: { subscription_ids: [] } }]);
		expect(
			autumnBillingPlan.patchCustomerProducts?.map(
				({ customerProduct }) => customerProduct.id,
			),
		).toEqual([customerProduct.id]);
		expect(phases[0]?.customerProductIds).toEqual([customerProduct.id]);
	});

	test("a cancelled subscription rebuilt with another paid plan replaces the identical plan too", () => {
		const ctx = contexts.create({});
		const currentEpochMs = 1_800_000_000_000;
		const { pro, customerProduct } = proWithCustomerProduct({
			subscriptionIds: [cancelledSubscription.id],
		});
		const addOn = products.createFull({
			id: "addon",
			isAddOn: true,
			prices: [prices.createFixed({ id: "price_addon" })],
		});

		const billingContext = {
			...createBillingContext({
				currentEpochMs,
				productContexts: [
					requestProductContext({
						fullProduct: pro,
						currentCustomerProduct: customerProduct,
					}),
					requestProductContext({ fullProduct: addOn }),
				],
				immediatePhase: {
					starts_at: currentEpochMs,
					plans: [{ plan_id: pro.id }, { plan_id: addOn.id }],
				},
			}),
			replacedStripeSubscription: cancelledSubscription,
		};

		const { autumnBillingPlan } = computeSetPlansPlanFromContext({
			ctx,
			billingContext,
		});

		expect(
			autumnBillingPlan.insertCustomerProducts.map(
				({ product_id }) => product_id,
			),
		).toEqual([pro.id, addOn.id]);
		expect(autumnBillingPlan.updateCustomerProducts?.[0]?.updates.status).toBe(
			CusProductStatus.Expired,
		);
	});

	test("a paused subscription replaces the identical plan, since its period was never paid", () => {
		const ctx = contexts.create({});
		const currentEpochMs = 1_800_000_000_000;
		const pausedSubscription = {
			id: "sub_paused",
			status: "paused",
		} as Stripe.Subscription;
		const { pro, customerProduct } = proWithCustomerProduct({
			subscriptionIds: [pausedSubscription.id],
		});

		const billingContext = {
			...createBillingContext({
				currentEpochMs,
				productContexts: [
					requestProductContext({
						fullProduct: pro,
						currentCustomerProduct: customerProduct,
					}),
				],
				immediatePhase: {
					starts_at: currentEpochMs,
					plans: [{ plan_id: pro.id }],
				},
			}),
			replacedStripeSubscription: pausedSubscription,
		};

		const { autumnBillingPlan } = computeSetPlansPlanFromContext({
			ctx,
			billingContext,
		});

		expect(
			autumnBillingPlan.insertCustomerProducts.map(
				({ product_id }) => product_id,
			),
		).toEqual([pro.id]);
		expect(autumnBillingPlan.updateCustomerProducts?.[0]?.updates.status).toBe(
			CusProductStatus.Expired,
		);
	});
});

describe(
	chalk.yellowBright("computeSetPlansPlan: resuming after payment"),
	() => {
		test("a deferred plan that keeps a plan and adds one persists the phases set_plans computed", () => {
			const ctx = contexts.create({});
			const currentEpochMs = 1_800_000_000_000;
			const { pro, customerProduct } = proWithCustomerProduct({
				subscriptionIds: ["sub_live"],
			});
			const addon = products.createFull({
				id: "addon",
				isAddOn: true,
				prices: [prices.createFixed({ id: "price_addon" })],
			});

			const billingContext = createBillingContext({
				currentEpochMs,
				productContexts: [
					requestProductContext({
						fullProduct: pro,
						currentCustomerProduct: customerProduct,
					}),
					requestProductContext({ fullProduct: addon }),
				],
				immediatePhase: {
					starts_at: currentEpochMs,
					plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
				},
			});

			const { autumnBillingPlan, phases } = computeSetPlansPlanFromContext({
				ctx,
				billingContext,
			});

			const persistedPhases = deferredSetPlansSchedulePhases({
				billingContext,
				billingPlan: { autumn: autumnBillingPlan, stripe: {} },
			});
			expect(persistedPhases).toEqual(phases);
			expect(persistedPhases[0]?.customerProductIds).toContain(
				customerProduct.id,
			);
		});
	},
);

const PHASE_START_MS = 1_790_939_142_802;
const PHASE_START_SECONDS = 1_790_939_142_000;

test("an exact-ms anchor resets the cycle at a phase start stored at Stripe's second precision", () => {
	expect(
		phaseResetsBillingCycle({
			billingCycleAnchorResetsAt: PHASE_START_MS,
			phaseStartsAt: PHASE_START_SECONDS,
		}),
	).toBe(true);
});

test("an anchor at a different second does not reset the cycle at the phase start", () => {
	expect(
		phaseResetsBillingCycle({
			billingCycleAnchorResetsAt: PHASE_START_MS + 1000,
			phaseStartsAt: PHASE_START_SECONDS,
		}),
	).toBe(false);
	expect(
		phaseResetsBillingCycle({
			billingCycleAnchorResetsAt: null,
			phaseStartsAt: PHASE_START_SECONDS,
		}),
	).toBe(false);
});

describe(chalk.yellowBright("computeSetPlansPlan: future first phase"), () => {
	const currentEpochMs = 1_800_000_000_000;
	const startsAt = currentEpochMs + ms.days(7) + 123;

	const futureStartContext = ({
		currentCustomerProduct,
		fullProduct,
	}: {
		currentCustomerProduct?: FullCusProduct;
		fullProduct: MultiAttachProductContext["fullProduct"];
	}) =>
		createBillingContext({
			currentEpochMs,
			productContexts: [
				requestProductContext({ fullProduct, currentCustomerProduct }),
			],
			immediatePhase: {
				starts_at: startsAt,
				plans: [{ plan_id: fullProduct.id }],
			},
		});

	test("with nothing live, the plan is scheduled at the start and nothing is charged now", () => {
		const ctx = contexts.create({});
		const { pro } = proWithCustomerProduct();

		const { autumnBillingPlan, phases, immediatePhaseTransition } =
			computeSetPlansPlanFromContext({
				ctx,
				billingContext: futureStartContext({ fullProduct: pro }),
			});

		const [scheduled] = autumnBillingPlan.insertCustomerProducts;
		expect(autumnBillingPlan.insertCustomerProducts).toHaveLength(1);
		expect(scheduled?.status).toBe(CusProductStatus.Scheduled);
		expect(scheduled?.starts_at).toBe(startsAt);
		expect(scheduled?.access_starts_at).toBeNull();
		expect(autumnBillingPlan.lineItems ?? []).toEqual([]);
		expect(immediatePhaseTransition.incomingCustomerProducts).toEqual([]);
		expect(phases).toEqual([{ startsAt, customerProductIds: [scheduled!.id] }]);
	});

	test("a live plan ends now with a credit, and its successor starts at the start", () => {
		const ctx = contexts.create({});
		const { pro, customerProduct } = proWithCustomerProduct({
			subscriptionIds: ["sub_live"],
		});
		customerProduct.starts_at = currentEpochMs - ms.days(10);

		const { autumnBillingPlan } = computeSetPlansPlanFromContext({
			ctx,
			billingContext: futureStartContext({
				fullProduct: pro,
				currentCustomerProduct: customerProduct,
			}),
		});

		const [ended] = autumnBillingPlan.updateCustomerProducts ?? [];
		expect(ended?.customerProduct.id).toBe(customerProduct.id);
		expect(ended?.updates.status).toBe(CusProductStatus.Expired);
		expect(ended?.updates.ended_at).toBe(currentEpochMs);

		const [successor] = autumnBillingPlan.insertCustomerProducts;
		expect(successor?.status).toBe(CusProductStatus.Scheduled);
		expect(successor?.starts_at).toBe(startsAt);

		const lineItems = autumnBillingPlan.lineItems ?? [];
		expect(lineItems.length).toBeGreaterThan(0);
		expect(
			lineItems.every(
				(lineItem) =>
					lineItem.context.customerProduct?.id === customerProduct.id &&
					lineItem.amountAfterDiscounts < 0,
			),
		).toBe(true);
	});

	test("early access makes the plan active now while billing waits for the start", () => {
		const ctx = contexts.create({});
		const { pro } = proWithCustomerProduct();

		const { autumnBillingPlan } = computeSetPlansPlanFromContext({
			ctx,
			billingContext: {
				...futureStartContext({ fullProduct: pro }),
				accessStartsAt: currentEpochMs,
			},
		});

		const [enabled] = autumnBillingPlan.insertCustomerProducts;
		expect(enabled?.status).toBe(CusProductStatus.Active);
		expect(enabled?.access_starts_at).toBe(currentEpochMs);
		expect(enabled?.starts_at).toBe(startsAt);
		expect(autumnBillingPlan.lineItems ?? []).toEqual([]);
	});

	test("a free plan with nothing in Stripe to start it is rejected", async () => {
		const ctx = contexts.create({});
		const free = products.createFull({ id: "free", prices: [] });
		const billingContext = futureStartContext({ fullProduct: free });

		const { autumnBillingPlan, immediatePhaseTransition } =
			computeSetPlansPlanFromContext({ ctx, billingContext });

		await expect(
			handleSetPlansComputeErrors({
				ctx,
				billingContext,
				autumnBillingPlan,
				immediatePhaseTransition,
			}),
		).rejects.toThrow("can't start on a later date");
	});

	test("an ongoing plan starts and is charged now while the first phase starts later", () => {
		const ctx = contexts.create({});
		const { pro } = proWithCustomerProduct();
		const sso = products.createFull({
			id: "sso",
			isAddOn: true,
			prices: [prices.createFixed({ id: "price_sso" })],
		});
		const billingContext: CreateScheduleBillingContext = {
			...createBillingContext({
				currentEpochMs,
				productContexts: [
					requestProductContext({ fullProduct: pro }),
					{ ...requestProductContext({ fullProduct: sso }), unscheduled: true },
				],
				immediatePhase: { starts_at: startsAt, plans: [{ plan_id: pro.id }] },
			}),
			resetCycleAnchorMs: startsAt,
		};

		const { autumnBillingPlan } = computeSetPlansPlanFromContext({
			ctx,
			billingContext,
		});

		const byProduct = new Map(
			autumnBillingPlan.insertCustomerProducts.map((customerProduct) => [
				customerProduct.product_id,
				customerProduct,
			]),
		);
		expect(byProduct.get(pro.id)?.status).toBe(CusProductStatus.Scheduled);
		expect(byProduct.get(pro.id)?.starts_at).toBe(startsAt);
		expect(byProduct.get(sso.id)?.status).toBe(CusProductStatus.Active);
		expect(byProduct.get(sso.id)?.starts_at).toBe(currentEpochMs);
		expect(
			(autumnBillingPlan.lineItems ?? []).some(
				(lineItem) =>
					lineItem.context.customerProduct?.id === byProduct.get(sso.id)?.id &&
					lineItem.amountAfterDiscounts > 0,
			),
		).toBe(true);
	});

	test("early access lets a free plan with nothing in Stripe start now", async () => {
		const ctx = contexts.create({});
		const free = products.createFull({ id: "free", prices: [] });
		const billingContext = {
			...futureStartContext({ fullProduct: free }),
			accessStartsAt: currentEpochMs,
		};

		const { autumnBillingPlan, immediatePhaseTransition } =
			computeSetPlansPlanFromContext({ ctx, billingContext });

		await expect(
			handleSetPlansComputeErrors({
				ctx,
				billingContext,
				autumnBillingPlan,
				immediatePhaseTransition,
			}),
		).resolves.toBeUndefined();
	});

	test("early access still rejects a paid one-off plan Stripe has nothing to bill at the start", async () => {
		const ctx = contexts.create({});
		const credits = products.createFull({
			id: "credits",
			prices: [prices.createOneOff({ id: "price_credits" })],
		});
		const billingContext = {
			...futureStartContext({ fullProduct: credits }),
			accessStartsAt: currentEpochMs,
		};

		const { autumnBillingPlan, immediatePhaseTransition } =
			computeSetPlansPlanFromContext({ ctx, billingContext });

		expect(autumnBillingPlan.insertCustomerProducts[0]?.status).toBe(
			CusProductStatus.Active,
		);
		await expect(
			handleSetPlansComputeErrors({
				ctx,
				billingContext,
				autumnBillingPlan,
				immediatePhaseTransition,
			}),
		).rejects.toThrow("can't start on a later date");
	});
});
