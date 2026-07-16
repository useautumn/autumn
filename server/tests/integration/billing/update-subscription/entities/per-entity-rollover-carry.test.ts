/**
 * TDD test: updateSubscription must carry rollovers bucket-for-bucket when the
 * plan has BOTH a prepaid (volume) item and an overage item for the SAME
 * feature, with per-entity balances (multi-entity).
 *
 * Red-failure mode (current behavior):
 *  - applyExistingRollovers matches carried rollovers by internal_feature_id
 *    only (first match), so both the prepaid-bucket rollover AND the
 *    overage-bucket rollover land on the first rollover-capable cusEnt of the
 *    new customer product. clearExcessRollovers then clips the combined
 *    balance against that single bucket's max (per entity), silently
 *    destroying rollover balance.
 *
 * Green-success criteria (after fix):
 *  - Each rollover is carried onto the new cusEnt of the same billing kind
 *    (prepaid -> prepaid, overage -> overage); per-entity rollover balances
 *    and totals are identical before and after the version update.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV0,
	BillingInterval,
	BillingMethod,
	BillingVersion,
	findActiveCustomerProductById,
	isFixedPrice,
	ResetInterval,
	RolloverExpiryDurationType,
	TierBehavior,
	type UpdateSubscriptionV1Params,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import {
	cusProductToEnts,
	cusProductToPrices,
} from "@shared/utils/cusProductUtils/convertCusProduct";
import { customerProductToBasePrice } from "@shared/utils/cusProductUtils/convertCusProduct/customerProductToPrice";
import { mapToProductItems } from "@shared/utils/productV2Utils/mapToProductV2";
import { productItemsToCustomizePlanV1 } from "@shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
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

const PREPAID_ROLLOVER_MAX = 40;
const OVERAGE_ROLLOVER_MAX = 30;

// After the cycle reset, each bucket rolls over up to its own max per entity.
const expectedRollovers = [OVERAGE_ROLLOVER_MAX, PREPAID_ROLLOVER_MAX];

const entityRolloverBalances = (entity: ApiEntityV0) =>
	(entity.features?.[TestFeature.Messages]?.rollovers ?? [])
		.map((rollover) => rollover.balance)
		.sort((a, b) => a - b);

const buildItems = () => ({
	prepaidVolumeMessages: constructPrepaidItem({
		featureId: TestFeature.Messages,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf" as unknown as number, amount: 5 },
		],
		tierBehaviour: TierBehavior.VolumeBased,
		billingUnits: 100,
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
		rolloverConfig: {
			max: PREPAID_ROLLOVER_MAX,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	}),
	overageMessages: constructArrearItem({
		featureId: TestFeature.Messages,
		includedUsage: 50,
		price: 0.1,
		billingUnits: 1,
		entityFeatureId: TestFeature.Users,
		rolloverConfig: {
			max: OVERAGE_ROLLOVER_MAX,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		},
	}),
	priceItem: items.monthlyPrice({ price: 30 }),
});

// Same items expressed in the public plan-item param shape, for
// customize.items (PUT) and add_items (PATCH) calls.
const buildApiItems = () => ({
	prepaidVolume: {
		feature_id: TestFeature.Messages,
		included: 100,
		entity_feature_id: TestFeature.Users,
		reset: { interval: ResetInterval.Month },
		price: {
			tiers: [
				{ to: 500, amount: 10 },
				{ to: "inf" as const, amount: 5 },
			],
			tier_behavior: TierBehavior.VolumeBased,
			interval: BillingInterval.Month,
			billing_method: BillingMethod.Prepaid,
			billing_units: 100,
		},
		rollover: {
			max: PREPAID_ROLLOVER_MAX,
			expiry_duration_type: RolloverExpiryDurationType.Month,
			expiry_duration_length: 1,
		},
	},
	overage: {
		feature_id: TestFeature.Messages,
		included: 50,
		entity_feature_id: TestFeature.Users,
		reset: { interval: ResetInterval.Month },
		price: {
			amount: 0.1,
			interval: BillingInterval.Month,
			billing_method: BillingMethod.UsageBased,
			billing_units: 1,
		},
		rollover: {
			max: OVERAGE_ROLLOVER_MAX,
			expiry_duration_type: RolloverExpiryDurationType.Month,
			expiry_duration_length: 1,
		},
	},
});

const setupPrepaidOverageEntities = async ({
	customerId,
	extraProducts = [],
}: {
	customerId: string;
	extraProducts?: ReturnType<typeof products.base>[];
}) => {
	const builtItems = buildItems();

	const pro = products.base({
		id: "pro",
		items: [
			builtItems.prepaidVolumeMessages,
			builtItems.overageMessages,
			builtItems.priceItem,
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, ...extraProducts] }),
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

	for (const entity of scenario.entities) {
		const entityBefore = await scenario.autumnV1.entities.get<ApiEntityV0>(
			scenario.customerId,
			entity.id,
		);
		expect(
			entityRolloverBalances(entityBefore),
			`pre-update rollovers wrong for ${entity.id} — test setup issue, not the bug`,
		).toEqual(expectedRollovers);
	}

	return { ...scenario, pro, ...builtItems };
};

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: prepaid volume + overage rollovers survive version update")}`,
	async () => {
		const {
			customerId,
			autumnV1,
			autumnV2_2,
			entities,
			pro,
			prepaidVolumeMessages,
			overageMessages,
		} = await setupPrepaidOverageEntities({
			customerId: "ent-rollover-carry-prepaid-overage",
		});

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
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after version update`,
			).toEqual(expectedRollovers);
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
	`${chalk.yellowBright("entity rollover carry: patch updating both same-feature items keeps bucket rollovers")}`,
	async () => {
		const { customerId, autumnV1, autumnV2_2, entities, pro } =
			await setupPrepaidOverageEntities({
				customerId: "ent-rollover-carry-patch-both",
			});

		// Patch path: update BOTH same-feature items in one call so both cusEnts
		// are rebuilt and land in the same feature carry group.
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				update_items: [
					{
						filter: {
							feature_id: TestFeature.Messages,
							billing_method: BillingMethod.Prepaid,
						},
						// Must stay a multiple of billingUnits (100) so the Stripe
						// prepaid quantity remains an integer pack count.
						included: 200,
					},
					{
						filter: {
							feature_id: TestFeature.Messages,
							billing_method: BillingMethod.UsageBased,
						},
						included: 60,
					},
				],
			},
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after patch update`,
			).toEqual(expectedRollovers);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: PUT-style customize.items keeps bucket rollovers")}`,
	async () => {
		const { customerId, autumnV1, autumnV2_2, entities, pro } =
			await setupPrepaidOverageEntities({
				customerId: "ent-rollover-carry-put-items",
			});

		const apiItems = buildApiItems();

		// PUT-style: replace the full item list; both feature items stay identical.
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				items: [apiItems.prepaidVolume, apiItems.overage],
				price: { amount: 35, interval: BillingInterval.Month },
			},
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after PUT-style items update`,
			).toEqual(expectedRollovers);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: remove_items + add_items keeps bucket rollovers")}`,
	async () => {
		const { customerId, autumnV1, autumnV2_2, entities, pro } =
			await setupPrepaidOverageEntities({
				customerId: "ent-rollover-carry-remove-add",
			});

		const apiItems = buildApiItems();

		// PATCH-style: remove both same-feature items and re-add equivalents.
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				remove_items: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.Prepaid,
					},
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.UsageBased,
					},
				],
				add_items: [apiItems.prepaidVolume, apiItems.overage],
			},
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after remove+add update`,
			).toEqual(expectedRollovers);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: attach plan switch (new customer product) keeps bucket rollovers")}`,
	async () => {
		const switchItems = buildItems();
		const pro2 = products.base({
			id: "pro2",
			items: [
				switchItems.prepaidVolumeMessages,
				switchItems.overageMessages,
				items.monthlyPrice({ price: 40 }),
			],
		});

		const { customerId, autumnV1, autumnV2_2, entities } =
			await setupPrepaidOverageEntities({
				customerId: "ent-rollover-carry-attach-switch",
				extraProducts: [pro2],
			});

		// Plan switch via attach: a brand-new customer product replaces the old
		// one; both plans contain the same prepaid + overage items.
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: pro2.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after attach plan switch`,
			).toEqual(expectedRollovers);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: migration (updateSubscription contextOverride) keeps bucket rollovers")}`,
	async () => {
		const { customerId, autumnV1, autumnV2_2, entities, ctx, pro } =
			await setupPrepaidOverageEntities({
				customerId: "ent-rollover-carry-migration",
			});

		const v2Items = buildItems();
		await autumnV1.products.update(pro.id, {
			items: [
				v2Items.prepaidVolumeMessages,
				v2Items.overageMessages,
				items.monthlyPrice({ price: 45 }),
			],
		});

		// migrate() drives updateSubscription with a productContext override.
		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						version: 2,
					},
				],
			},
			runOnServer: false,
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after version migration`,
			).toEqual(expectedRollovers);
		}
	},
);

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
