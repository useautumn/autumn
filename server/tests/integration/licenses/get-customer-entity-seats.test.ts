/**
 * CusService.getFull with entityId includes the entity's license seat
 * products with inherited parent lifecycle.
 *
 * Contract under test:
 *   - getFull without entityId: seat products excluded (shared cache shape
 *     unchanged).
 *   - getFull({ entityId }): the seat product hydrates with the parent's
 *     status/subscription_ids inherited in memory.
 *   - Expired parent: the seat's inherited status flips to expired even
 *     though the parent row itself no longer hydrates (RELEVANT_STATUSES).
 */
import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

test.concurrent(
	`${chalk.yellowBright("getFull entity view: seats hydrate with inherited lifecycle")}`,
	async () => {
		const customerId = "get-cus-entity-seats";
		const parent = products.base({
			id: "entity-seats-parent",
			items: [items.monthlyPrice({ price: 10 }), items.dashboard()],
		});
		const devSeat = products.base({
			id: "entity-seats-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			group: "entity-seats-licenses",
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [parent, devSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: devSeat.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		const entityId = "entity-seats-entity";
		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: devSeat.id,
			entities: [
				{ entity_id: entityId, name: "Seat 1", feature_id: TestFeature.Users },
			],
		});

		// ── Plain getFull: no seat products ───────────────────────────────
		const plain = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(
			plain.customer_products.some(
				(customerProduct) => customerProduct.customer_license_link_id,
			),
		).toBe(false);
		const parentCusProduct = plain.customer_products.find(
			(customerProduct) => customerProduct.product.id === parent.id,
		);
		expect(parentCusProduct?.subscription_ids?.length).toBeGreaterThan(0);

		// ── Entity getFull: seat hydrates with inherited lifecycle ────────
		const entityView = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			entityId,
			withEntities: true,
		});
		const seat = entityView.customer_products.find(
			(customerProduct) => customerProduct.customer_license_link_id,
		);
		expect(seat, "seat product missing from entity getFull").toBeDefined();
		expect(seat?.status).toBe(CusProductStatus.Active);
		expect(seat?.subscription_ids).toEqual(
			parentCusProduct?.subscription_ids ?? [],
		);
		expect(
			seat?.customer_entitlements.some(
				(customerEntitlement) =>
					customerEntitlement.entitlement.feature.id === TestFeature.Messages,
			),
		).toBe(true);

		// ── Expired parent: inherited status flips even without parent row ─
		await CusProductService.update({
			ctx,
			cusProductId: parentCusProduct?.id ?? "",
			updates: { status: CusProductStatus.Expired },
		});

		const expiredView = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			entityId,
			withEntities: true,
		});
		const seatAfter = expiredView.customer_products.find(
			(customerProduct) => customerProduct.customer_license_link_id,
		);
		expect(seatAfter).toBeDefined();
		expect(seatAfter?.status).toBe(CusProductStatus.Expired);
	},
);
