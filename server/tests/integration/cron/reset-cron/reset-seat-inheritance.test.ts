/**
 * getActiveResetPassed: seat cusEnts (license assignments) inherit the pool
 * parent's lifecycle.
 *
 * Contract under test:
 *   - Seat cusEnt under an ACTIVE parent is returned, with the parent's
 *     status + subscription_ids overlaid on customer_product (so
 *     resetsViaInvoice / Stripe-anchor logic behaves like the parent's).
 *   - After the parent expires, the seat cusEnt drops out of the sweep —
 *     no reliance on the seat row's own (stale) status.
 *   - Non-seat cusEnts are untouched by the inheritance path.
 *
 * The sweep is app-wide: our rows are pinned to epoch-tiny next_reset_at
 * values so they sort into the first page, then asserted by id.
 */
import { expect, test } from "bun:test";
import {
	CusProductStatus,
	customerEntitlements,
	customerProducts,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, isNotNull } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";

const SWEEP_PAGE = 500;

test.concurrent(
	`${chalk.yellowBright("reset-cron: seat cusEnts inherit parent lifecycle in the sweep")}`,
	async () => {
		const customerId = "reset-seat-inheritance";
		const parent = products.base({
			id: "reset-inherit-parent",
			items: [items.monthlyPrice({ price: 10 }), items.dashboard()],
		});
		const devSeat = products.base({
			id: "reset-inherit-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
			group: "reset-inherit-licenses",
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

		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: devSeat.id,
			entities: [
				{
					entity_id: "reset-seat-entity",
					name: "Seat 1",
					feature_id: TestFeature.Users,
				},
			],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const parentCusProduct = fullCustomer.customer_products.find(
			(customerProduct) => customerProduct.product.id === parent.id,
		);
		expect(parentCusProduct).toBeDefined();
		expect(parentCusProduct?.subscription_ids?.length).toBeGreaterThan(0);

		// Seats are excluded from FullCustomer — fetch the seat row directly.
		const [seatCusProduct] = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				and(
					eq(customerProducts.internal_customer_id, fullCustomer.internal_id),
					isNotNull(customerProducts.customer_license_link_id),
					isNotNull(customerProducts.internal_entity_id),
				),
			);
		expect(seatCusProduct).toBeDefined();
		expect(seatCusProduct.subscription_ids ?? []).toEqual([]);

		const [seatCusEnt] = await ctx.db
			.select()
			.from(customerEntitlements)
			.where(
				and(
					eq(customerEntitlements.customer_product_id, seatCusProduct.id),
					isNotNull(customerEntitlements.next_reset_at),
				),
			);
		expect(seatCusEnt).toBeDefined();

		// Pin our rows to the front of the app-wide sweep ordering.
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: 1000 })
			.where(eq(customerEntitlements.id, seatCusEnt.id));

		// ── Active parent: seat swept, parent lifecycle overlaid ─────────
		const activeSweep = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			batchSize: SWEEP_PAGE,
			limit: SWEEP_PAGE,
		});
		const sweptSeat = activeSweep.find((row) => row.id === seatCusEnt.id);
		expect(
			sweptSeat,
			"seat cusEnt missing from sweep under active parent",
		).toBeDefined();
		expect(sweptSeat?.customer_product?.status).toBe(CusProductStatus.Active);
		expect(sweptSeat?.customer_product?.subscription_ids).toEqual(
			parentCusProduct?.subscription_ids ?? [],
		);

		// ── Expired parent: seat drops out, seat row itself untouched ────
		await CusProductService.update({
			ctx,
			cusProductId: parentCusProduct?.id ?? "",
			updates: { status: CusProductStatus.Expired },
		});

		const expiredSweep = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			batchSize: SWEEP_PAGE,
			limit: SWEEP_PAGE,
		});
		expect(
			expiredSweep.find((row) => row.id === seatCusEnt.id),
		).toBeUndefined();

		// Seat row status is still active in the DB — exclusion came from the
		// parent join, not a write.
		const [seatAfter] = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.id, seatCusProduct.id));
		expect(seatAfter.status).toBe(CusProductStatus.Active);
	},
);
