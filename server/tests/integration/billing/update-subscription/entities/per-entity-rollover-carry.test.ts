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
	ResetInterval,
	RolloverExpiryDurationType,
	TierBehavior,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	constructArrearItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";

const PREPAID_ROLLOVER_MAX = 40;
const OVERAGE_ROLLOVER_MAX = 30;

// After the cycle reset, each bucket rolls over up to its own max per entity.
const expectedRollovers = [OVERAGE_ROLLOVER_MAX, PREPAID_ROLLOVER_MAX];

import { entityRolloverBalances } from "./entityRolloverBalances";

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
