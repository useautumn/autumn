/**
 * Seat-sync cron: seat customer products converge onto the pool parent's
 * lifecycle (status, subscription_ids, scheduled_ids).
 *
 * Contract under test:
 *   - Fresh seats (born without subscription_ids) get the parent's stamped.
 *   - After the parent expires, the next run flips the seat row to expired.
 *   - Idempotent: a converged seat is not selected again (updated_at stable).
 */
import { expect, test } from "bun:test";
import { CusProductStatus, customerProducts } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, isNotNull } from "drizzle-orm";
import { runSeatSyncCron } from "@/cron/seatSyncCron/runSeatSyncCron.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusService } from "@/internal/customers/CusService.js";

test.concurrent(
	`${chalk.yellowBright("seat-sync cron: seat rows converge onto parent lifecycle")}`,
	async () => {
		const customerId = "seat-sync-cron";
		const parent = products.base({
			id: "seat-sync-parent",
			items: [items.monthlyPrice({ price: 10 }), items.dashboard()],
		});
		const devSeat = products.base({
			id: "seat-sync-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
			group: "seat-sync-licenses",
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
					entity_id: "seat-sync-entity",
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
		expect(parentCusProduct?.subscription_ids?.length).toBeGreaterThan(0);

		const getSeat = async () => {
			const [seat] = await ctx.db
				.select()
				.from(customerProducts)
				.where(
					and(
						eq(
							customerProducts.internal_customer_id,
							fullCustomer.internal_id,
						),
						isNotNull(customerProducts.customer_license_link_id),
					),
				);
			return seat;
		};

		// Born drifted: no subscription_ids on the seat.
		const seatBefore = await getSeat();
		expect(seatBefore.subscription_ids ?? []).toEqual([]);

		// ── Run 1: parent's sub ids stamped onto the seat ─────────────────
		await runSeatSyncCron({ ctx });
		const seatSynced = await getSeat();
		expect(seatSynced.subscription_ids).toEqual(
			parentCusProduct?.subscription_ids ?? [],
		);
		expect(seatSynced.status).toBe(CusProductStatus.Active);

		// ── Idempotent: converged seat is untouched on the next run ──────
		await runSeatSyncCron({ ctx });
		const seatIdle = await getSeat();
		expect(seatIdle.updated_at).toBe(seatSynced.updated_at);

		// ── Parent expires: next run flips the seat row ───────────────────
		await CusProductService.update({
			ctx,
			cusProductId: parentCusProduct?.id ?? "",
			updates: { status: CusProductStatus.Expired },
		});
		await runSeatSyncCron({ ctx });
		const seatExpired = await getSeat();
		expect(seatExpired.status).toBe(CusProductStatus.Expired);
	},
);
