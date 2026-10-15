/**
 * Contract: a seat provisioned from a license plan prices its credits by that
 * license plan's merged card — the catalog item's feature_override, or the
 * one an attach-time license customization supplies.
 */

import { expect, test } from "bun:test";
import type {
	ApiEntityV2,
	AttachParamsV1Input,
	CheckResponseV3,
	FeatureConfigOverride,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

// Catalog Credits schema: Action1 = 0.2, Action2 = 0.6 (see v2Features.ts).
const SEAT_CREDITS = 100;

/** Action1 is denied and never drawn; Action2 draws at the override's 2/unit. */
const expectSeatUsesMergedCard = async ({
	autumnV1,
	autumnV2_3,
	customerId,
	entityId,
}: {
	autumnV1: AutumnInt;
	autumnV2_3: AutumnInt;
	customerId: string;
	entityId: string;
}) => {
	const check = await autumnV2_3.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Action1,
	});
	expect(check.allowed).toBe(false);

	await autumnV1
		.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Action1,
			value: 100,
		})
		.catch(() => undefined);
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Action2,
		value: 10,
	});

	const entity = await autumnV2_3.entities.get<ApiEntityV2>(
		customerId,
		entityId,
		{ skip_cache: "true" },
	);
	expect(entity.balances?.[TestFeature.Credits]?.remaining).toBe(
		SEAT_CREDITS - 20,
	);
};

test.concurrent(
	`${chalk.yellowBright("license credit override: a customized license plan's seat uses its merged card")}`,
	async () => {
		const customerId = "lic-override-customized";
		const parent = products.base({
			id: "lic-override-customized-parent",
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "lic-override-customized-seat",
			items: [items.monthlyCredits({ includedUsage: SEAT_CREDITS })],
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 1,
				}),
			],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				upsert_licenses: [
					{
						license_plan_id: seat.id,
						customize: {
							remove_items: [{ feature_id: TestFeature.Credits }],
							add_items: [
								{
									...itemsV2.monthlyCredits({ included: SEAT_CREDITS }),
									feature_override: {
										credit_schema: [
											{
												metered_feature_id: TestFeature.Action1,
												excluded: true,
											},
											{
												metered_feature_id: TestFeature.Action2,
												credit_cost: 2,
											},
										],
									},
								},
							],
						},
					},
				],
			},
		});
		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: seat.id,
			entities: [
				{ entity_id: "seat-1", name: "Seat 1", feature_id: TestFeature.Users },
			],
		});

		await expectSeatUsesMergedCard({
			autumnV1,
			autumnV2_3,
			customerId,
			entityId: "seat-1",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license credit override: a catalog license plan's override reaches its seat")}`,
	async () => {
		const customerId = "lic-override-catalog";
		const featureOverride: FeatureConfigOverride = {
			schema: [
				{ metered_feature_id: TestFeature.Action1, excluded: true },
				{ metered_feature_id: TestFeature.Action2, credit_amount: 2 },
			],
		};
		const creditsItem = items.monthlyCredits({ includedUsage: SEAT_CREDITS });
		const parent = products.base({
			id: "lic-override-catalog-parent",
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "lic-override-catalog-seat",
			items: [
				{
					...creditsItem,
					config: { ...creditsItem.config, feature_override: featureOverride },
				},
			],
		});

		const { autumnV1, autumnV2_3, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({ licenseProductId: seat.id, entityIndexes: [0] }),
			],
		});

		await expectSeatUsesMergedCard({
			autumnV1,
			autumnV2_3,
			customerId,
			entityId: entities[0]!.id,
		});
	},
);
