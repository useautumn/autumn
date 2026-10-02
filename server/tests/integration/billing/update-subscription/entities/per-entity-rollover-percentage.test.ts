import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV0,
	BillingVersion,
	findActiveCustomerProductById,
	isFixedPrice,
	RolloverExpiryDurationType,
	TierBehavior,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import {
	cusProductToEnts,
	cusProductToPrices,
} from "@shared/utils/cusProductUtils/convertCusProduct";
import { customerProductToBasePrice } from "@shared/utils/cusProductUtils/convertCusProduct/customerProductToPrice";
import { mapToProductItems } from "@shared/utils/productV2Utils/mapToProductV2";
import { productItemsToCustomizePlanV1 } from "@shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { billingActions } from "@/internal/billing/v2/actions";
import { setupCustomFullProduct } from "@/internal/billing/v2/setup/setupCustomFullProduct";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { ProductService } from "@/internal/products/ProductService";
import {
	constructArrearItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";
import { entityRolloverBalances } from "./entityRolloverBalances";

// Prepaid volume with 50% max_percentage rollover; overage deliberately has
// NO rollover config.
const buildPctItems = ({
	entityScoped = true,
}: {
	entityScoped?: boolean;
} = {}) => ({
	prepaidVolumeMessages: constructPrepaidItem({
		featureId: TestFeature.Messages,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf" as unknown as number, amount: 5 },
		],
		tierBehaviour: TierBehavior.VolumeBased,
		billingUnits: 100,
		includedUsage: 100,
		entityFeatureId: entityScoped ? TestFeature.Users : undefined,
		rolloverConfig: {
			max_percentage: 50,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	}),
	overageMessages: constructArrearItem({
		featureId: TestFeature.Messages,
		includedUsage: 50,
		price: 0.1,
		billingUnits: 1,
		entityFeatureId: entityScoped ? TestFeature.Users : undefined,
	}),
});

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: prepaid 50% max_percentage rollover + overage without rollover survives version update")}`,
	async () => {
		const customerId = "ent-rollover-carry-pct-prepaid";

		const { prepaidVolumeMessages, overageMessages } = buildPctItems();

		const pro = products.base({
			id: "pro",
			items: [
				prepaidVolumeMessages,
				overageMessages,
				items.monthlyPrice({ price: 30 }),
			],
		});

		const { autumnV1, autumnV2_2, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
				s.advanceToNextInvoice(),
			],
		});

		// Snapshot per-entity rollovers after the cycle reset. Exactly one
		// positive rollover per entity is expected (prepaid bucket only).
		const rolloversBefore: Record<string, number[]> = {};
		for (const entity of entities) {
			const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			const balances = entityRolloverBalances(entityBefore).filter(
				(balance) => balance > 0,
			);
			expect(
				balances.length,
				`expected exactly one positive rollover for ${entity.id} before update — test setup issue, not the bug`,
			).toBe(1);
			rolloversBefore[entity.id] = balances;
		}

		const customerBefore =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const remainingBefore =
			customerBefore.balances[TestFeature.Messages].remaining;

		// v2 keeps BOTH feature items identical; only the base price changes.
		await autumnV1.products.update(pro.id, {
			items: [
				prepaidVolumeMessages,
				overageMessages,
				items.monthlyPrice({ price: 35 }),
			],
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			version: 2,
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter).filter((balance) => balance > 0),
				`rollovers lost for ${entity.id} after version update`,
			).toEqual(rolloversBefore[entity.id]);
		}

		const customerAfter =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			remaining: remainingBefore,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: direct updateSubscription with productContext override to premium carries rollovers")}`,
	async () => {
		const customerId = "ent-rollover-carry-ctx-override";

		const proItems = buildPctItems();
		const premiumItems = buildPctItems();

		const pro = products.base({
			id: "pro",
			items: [
				proItems.prepaidVolumeMessages,
				proItems.overageMessages,
				items.monthlyPrice({ price: 30 }),
			],
		});
		const premium = products.base({
			id: "premium",
			items: [
				premiumItems.prepaidVolumeMessages,
				premiumItems.overageMessages,
				items.monthlyPrice({ price: 50 }),
			],
		});

		const { autumnV1, autumnV2_2, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
				s.advanceToNextInvoice(),
			],
		});

		const rolloversBefore: Record<string, number[]> = {};
		for (const entity of entities) {
			const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			const balances = entityRolloverBalances(entityBefore).filter(
				(balance) => balance > 0,
			);
			expect(
				balances.length,
				`expected exactly one positive rollover for ${entity.id} before update — test setup issue, not the bug`,
			).toBe(1);
			rolloversBefore[entity.id] = balances;
		}

		const customerBefore =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const remainingBefore =
			customerBefore.balances[TestFeature.Messages].remaining;

		// Mirror the migration-script flow: load state, build a customize that
		// copies the current prepaid/overage items + base price verbatim, then
		// call updateSubscription directly with a productContext override
		// selecting the premium plan.
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
			withSubs: true,
		});
		const cusProduct = findActiveCustomerProductById({
			fullCus: fullCustomer,
			productId: pro.id,
		});
		expect(cusProduct, "active pro cusProduct not found").toBeDefined();
		if (!cusProduct) throw new Error("unreachable");

		const premiumFull = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: premium.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const currentPrices = cusProductToPrices({ cusProduct });
		const currentMessageItems = mapToProductItems({
			prices: currentPrices,
			entitlements: cusProductToEnts({ cusProduct }),
			features: ctx.features,
		})
			.filter((item) => item.feature_id === TestFeature.Messages)
			.map((item) => ({
				...item,
				created_at: null,
				entitlement_id: null,
				price_id: null,
			}));
		expect(currentMessageItems.length).toBe(2);

		const premiumNonMessageItems = mapToProductItems({
			prices: premiumFull.prices,
			entitlements: premiumFull.entitlements,
			features: ctx.features,
		}).filter((item) => item.feature_id !== TestFeature.Messages);

		const currentBase = customerProductToBasePrice({
			customerProduct: cusProduct,
			errorOnNotFound: false,
		});
		expect(currentBase).toBeDefined();
		if (!currentBase || !isFixedPrice(currentBase)) {
			throw new Error("expected a fixed base price on the pro cusProduct");
		}

		const customize = {
			...productItemsToCustomizePlanV1({
				ctx,
				items: [...premiumNonMessageItems, ...currentMessageItems],
			}),
			price: {
				amount: currentBase.config.amount,
				interval: currentBase.config.interval,
				interval_count: currentBase.config.interval_count,
			},
		};

		const {
			fullProduct: customTargetProduct,
			customPrices,
			customEnts,
		} = await setupCustomFullProduct({
			ctx,
			currentFullProduct: premiumFull,
			customizePlan: customize,
		});

		const params = {
			customer_id: customerId,
			customer_product_id: cusProduct.id,
			plan_id: premium.id,
			version: premiumFull.version,
			no_billing_changes: true,
			proration_behavior: "none",
			redirect_mode: "never",
			customize,
		} satisfies UpdateSubscriptionV1Params;

		await billingActions.updateSubscription({
			ctx,
			params,
			contextOverride: {
				productContext: {
					customerProduct: cusProduct,
					fullProduct: customTargetProduct,
					customPrices,
					customEnts,
				},
				billingVersion: cusProduct.billing_version ?? BillingVersion.V2,
			},
			options: { skipAutumnCheckout: true },
		});

		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "per-entity-rollover-carry-test",
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter).filter((balance) => balance > 0),
				`rollovers lost for ${entity.id} after productContext-override update`,
			).toEqual(rolloversBefore[entity.id]);
		}

		const customerAfterOverride =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterOverride,
			featureId: TestFeature.Messages,
			remaining: remainingBefore,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: productContext override on ENTITY-OWNED cusProduct carries rollovers")}`,
	async () => {
		const customerId = "ent-rollover-carry-entity-owned";

		// Plain (non-entity-scoped) items: each entity owns its own cusProduct.
		const proItems = buildPctItems({ entityScoped: false });
		const premiumItems = buildPctItems({ entityScoped: false });

		const pro = products.base({
			id: "pro",
			items: [
				proItems.prepaidVolumeMessages,
				proItems.overageMessages,
				items.monthlyPrice({ price: 30 }),
			],
		});
		const premium = products.base({
			id: "premium",
			items: [
				premiumItems.prepaidVolumeMessages,
				premiumItems.overageMessages,
				items.monthlyPrice({ price: 50 }),
			],
		});

		const { autumnV1, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
				s.advanceToNextInvoice(),
			],
		});

		const targetEntityId = entities[0].id;

		const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			targetEntityId,
		);
		const rolloversBefore = (
			entityBefore.features?.[TestFeature.Messages]?.rollovers ?? []
		)
			.map((rollover) => rollover.balance)
			.filter((balance) => balance > 0)
			.sort((a, b) => a - b);
		expect(
			rolloversBefore.length,
			"expected exactly one positive rollover on the entity before update — test setup issue, not the bug",
		).toBe(1);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
			withSubs: true,
		});
		const internalEntityId = fullCustomer.entities.find(
			(entity) => entity.id === targetEntityId,
		)?.internal_id;
		const cusProduct = findActiveCustomerProductById({
			fullCus: fullCustomer,
			productId: pro.id,
			internalEntityId,
		});
		expect(
			cusProduct,
			"active entity-owned pro cusProduct not found",
		).toBeDefined();
		if (!cusProduct) throw new Error("unreachable");

		const premiumFull = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: premium.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const currentPrices = cusProductToPrices({ cusProduct });
		const currentMessageItems = mapToProductItems({
			prices: currentPrices,
			entitlements: cusProductToEnts({ cusProduct }),
			features: ctx.features,
		})
			.filter((item) => item.feature_id === TestFeature.Messages)
			.map((item) => ({
				...item,
				created_at: null,
				entitlement_id: null,
				price_id: null,
			}));
		expect(currentMessageItems.length).toBe(2);

		const premiumNonMessageItems = mapToProductItems({
			prices: premiumFull.prices,
			entitlements: premiumFull.entitlements,
			features: ctx.features,
		}).filter((item) => item.feature_id !== TestFeature.Messages);

		const currentBase = customerProductToBasePrice({
			customerProduct: cusProduct,
			errorOnNotFound: false,
		});
		if (!currentBase || !isFixedPrice(currentBase)) {
			throw new Error("expected a fixed base price on the pro cusProduct");
		}

		const customize = {
			...productItemsToCustomizePlanV1({
				ctx,
				items: [...premiumNonMessageItems, ...currentMessageItems],
			}),
			price: {
				amount: currentBase.config.amount,
				interval: currentBase.config.interval,
				interval_count: currentBase.config.interval_count,
			},
		};

		const {
			fullProduct: customTargetProduct,
			customPrices,
			customEnts,
		} = await setupCustomFullProduct({
			ctx,
			currentFullProduct: premiumFull,
			customizePlan: customize,
		});

		const params = {
			customer_id: customerId,
			entity_id: cusProduct.entity_id ?? undefined,
			customer_product_id: cusProduct.id,
			plan_id: premium.id,
			version: premiumFull.version,
			no_billing_changes: true,
			proration_behavior: "none",
			redirect_mode: "never",
			customize,
		} satisfies UpdateSubscriptionV1Params;

		await billingActions.updateSubscription({
			ctx,
			params,
			contextOverride: {
				productContext: {
					customerProduct: cusProduct,
					fullProduct: customTargetProduct,
					customPrices,
					customEnts,
				},
				billingVersion: cusProduct.billing_version ?? BillingVersion.V2,
			},
			options: { skipAutumnCheckout: true },
		});

		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "per-entity-rollover-carry-test",
		});

		const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			targetEntityId,
		);
		const rolloversAfter = (
			entityAfter.features?.[TestFeature.Messages]?.rollovers ?? []
		)
			.map((rollover) => rollover.balance)
			.filter((balance) => balance > 0)
			.sort((a, b) => a - b);
		expect(
			rolloversAfter,
			"rollovers lost after productContext-override update on entity-owned cusProduct",
		).toEqual(rolloversBefore);
	},
);

// Mirrors the real Mintlify growth shape: the zero-allowance overage item ALSO
// carries a max_percentage rollover config, so its cap is 50% of 0 = 0. If the
// carried prepaid rollover lands on it, clearExcessRollovers wipes the balance.
test.concurrent(
	`${chalk.yellowBright("entity rollover carry: prepaid pct rollover + ZERO-allowance overage with pct rollover survives version update")}`,
	async () => {
		const customerId = "ent-rollover-carry-zero-overage";

		const pctRollover = {
			max_percentage: 50,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		};

		// Overage listed FIRST so its cusEnt is the first same-feature match.
		const overageZeroAllowance = constructArrearItem({
			featureId: TestFeature.Messages,
			includedUsage: 0,
			price: 0.01,
			billingUnits: 1,
			rolloverConfig: pctRollover,
		});
		const prepaidVolumeMessages = constructPrepaidItem({
			featureId: TestFeature.Messages,
			tiers: [
				{ to: 500, amount: 10 },
				{ to: "inf" as unknown as number, amount: 5 },
			],
			tierBehaviour: TierBehavior.VolumeBased,
			billingUnits: 100,
			includedUsage: 100,
			rolloverConfig: pctRollover,
		});

		const pro = products.base({
			id: "pro",
			items: [
				overageZeroAllowance,
				prepaidVolumeMessages,
				items.monthlyPrice({ price: 30 }),
			],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
				s.advanceToNextInvoice(),
			],
		});

		const targetEntityId = entities[0].id;

		const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			targetEntityId,
		);
		const rolloversBefore = (
			entityBefore.features?.[TestFeature.Messages]?.rollovers ?? []
		)
			.map((rollover) => rollover.balance)
			.filter((balance) => balance > 0)
			.sort((a, b) => a - b);
		expect(
			rolloversBefore.length,
			"expected a positive prepaid rollover before update — test setup issue, not the bug",
		).toBeGreaterThanOrEqual(1);

		// v2 keeps both feature items identical; only the base price changes.
		await autumnV1.products.update(pro.id, {
			items: [
				overageZeroAllowance,
				prepaidVolumeMessages,
				items.monthlyPrice({ price: 35 }),
			],
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: targetEntityId,
			product_id: pro.id,
			version: 2,
		});

		const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			targetEntityId,
		);
		const rolloversAfter = (
			entityAfter.features?.[TestFeature.Messages]?.rollovers ?? []
		)
			.map((rollover) => rollover.balance)
			.filter((balance) => balance > 0)
			.sort((a, b) => a - b);
		expect(
			rolloversAfter,
			"rollover wiped: carried onto the zero-allowance overage bucket and cleared by its 0 cap",
		).toEqual(rolloversBefore);
	},
);
