/**
 * Regression: syncing a subscription re-inserts its plan and expires the old
 * row, so seat pools and their assignments must move onto the new row.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	type SyncParamsV1,
} from "@autumn/shared";
import {
	listLicenseAssignments,
	listLicensePools,
} from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";

const SEAT_QUANTITY = 3;

test.concurrent(
	`${chalk.yellowBright("sync-v2: re-syncing a plan keeps its license assignments")}`,
	async () => {
		const customerId = "sync-license-assignments";
		const pro = products.pro({ id: "pro", items: [items.dashboard()] });
		const seat = products.base({
			id: "seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { ctx, entities, autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pro, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: seat.id,
					included: SEAT_QUANTITY,
				}),
				s.billing.attach({ productId: pro.id }),
			],
		});

		for (const entity of entities) {
			await autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				plan_id: seat.id,
				entities: [{ entity_id: entity.id }],
			});
		}

		const before = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const oldPro = before.customer_products.find(
			(customerProduct) => customerProduct.product_id === pro.id,
		);
		const subscriptionId = oldPro?.subscription_ids?.[0];
		if (!oldPro || !subscriptionId) throw new Error("no Pro subscription");

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: subscriptionId,
			phases: [
				{
					starts_at: "now",
					plans: [
						{
							plan_id: pro.id,
							expire_previous: true,
							license_quantities: [
								{ license_plan_id: seat.id, quantity: SEAT_QUANTITY },
							],
						},
					],
				},
			],
		} satisfies SyncParamsV1);

		const after = await CusService.getFull({ ctx, idOrInternalId: customerId });
		const proRows = after.customer_products.filter(
			(customerProduct) => customerProduct.product_id === pro.id,
		);
		const newPro = proRows.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		expect(newPro?.id).toBeDefined();
		expect(newPro?.id).not.toBe(oldPro.id);

		const activeAssignments = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			licensePlanId: seat.id,
			active: true,
		});
		expect(
			activeAssignments.map((assignment) => assignment.entity_id).sort(),
		).toEqual(entities.map((entity) => entity.id).sort());

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools).toHaveLength(1);
		expect(pools[0]).toMatchObject({
			license_plan_id: seat.id,
			granted: SEAT_QUANTITY,
			usage: entities.length,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("sync-v2: re-syncing without license_quantities keeps purchased seats")}`,
	async () => {
		const customerId = "sync-license-purchased-seats";
		const pro = products.pro({ id: "pro", items: [items.dashboard()] });
		const seat = products.base({
			id: "paid-seat",
			items: [
				constructPriceItem({ price: 10, interval: BillingInterval.Month }),
			],
		});

		const { ctx, autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: seat.id,
					included: 1,
				}),
				s.billing.attach({
					productId: pro.id,
					licenseQuantities: [
						{ licenseProductId: seat.id, quantity: SEAT_QUANTITY },
					],
				}),
			],
		});

		const before = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const subscriptionId = before.customer_products.find(
			(customerProduct) => customerProduct.product_id === pro.id,
		)?.subscription_ids?.[0];
		if (!subscriptionId) throw new Error("no Pro subscription");

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: subscriptionId,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: pro.id, expire_previous: true }],
				},
			],
		} satisfies SyncParamsV1);

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools).toHaveLength(1);
		expect(pools[0]).toMatchObject({
			license_plan_id: seat.id,
			granted: SEAT_QUANTITY,
		});
	},
);
