/**
 * Lazy reset for license seat entitlements (entity subjects).
 *
 * Contract under test:
 *   - A seat cusEnt (free item under a license assignment) lazy-resets when
 *     the entity is fetched after next_reset_at passes; the new next_reset_at
 *     matches getNextResetAt exactly.
 *   - The planted next_reset_at sits on an edge date (day 30), so the reset
 *     walks getResetAtUpdate's Stripe-anchor branch using the PARENT's
 *     inherited subscription_ids (seats have none of their own).
 *   - A seat under an EXPIRED parent does NOT lazy-reset — the inherited
 *     status gates it out of the candidate set.
 */
import { expect, test } from "bun:test";
import {
	type ApiEntityV2,
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	EntInterval,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, isNotNull } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getNextResetAt } from "@/utils/timeUtils.js";

const INCLUDED_MESSAGES = 100;

/** Past timestamp on the 30th (a month that has one), noon UTC — lands the
 * naive advance on an edge date so the Stripe-anchor branch runs. */
const plantedEdgeResetAt = () => {
	const date = new UTCDate();
	for (let monthsBack = 2; monthsBack <= 5; monthsBack++) {
		const candidate = new UTCDate(
			date.getUTCFullYear(),
			date.getUTCMonth() - monthsBack,
			30,
			12,
			0,
			0,
		);
		if (candidate.getUTCDate() === 30) return candidate.getTime();
	}
	throw new Error("no month with a 30th found");
};

const setupSeatScenario = async ({
	customerId,
	idPrefix,
}: {
	customerId: string;
	idPrefix: string;
}) => {
	const parent = products.base({
		id: `${idPrefix}-parent`,
		items: [items.monthlyPrice({ price: 10 }), items.dashboard()],
	});
	const devSeat = products.base({
		id: `${idPrefix}-seat`,
		items: [items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES })],
		group: `${idPrefix}-licenses`,
	});

	const scenario = await initScenario({
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
	const { ctx, autumnV2_3 } = scenario;

	const entityId = `${idPrefix}-entity`;
	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeat.id,
		entities: [
			{ entity_id: entityId, name: "Seat 1", feature_id: TestFeature.Users },
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

	return {
		...scenario,
		entityId,
		parentCusProduct,
		seatCusProduct,
		seatCusEnt,
	};
};

test.concurrent(
	`${chalk.yellowBright("lazy reset (entity seat): resets via edge-date Stripe-anchor path with inherited sub")}`,
	async () => {
		const customerId = "lazy-reset-seat-active";
		const { ctx, autumnV1, autumnV2_3, entityId, seatCusEnt } =
			await setupSeatScenario({
				customerId,
				idPrefix: "lazy-seat-active",
			});

		await autumnV1.track(
			{
				customer_id: customerId,
				entity_id: entityId,
				feature_id: TestFeature.Messages,
				value: 30,
			},
			{ skipCache: true },
		);

		const before = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entityId,
			{ skip_cache: "true" },
		);
		expect(before.balances[TestFeature.Messages].remaining).toBe(
			INCLUDED_MESSAGES - 30,
		);

		// Plant an overdue edge-date reset so getResetAtUpdate's Stripe branch
		// runs against the parent's inherited subscription.
		const planted = plantedEdgeResetAt();
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: planted })
			.where(eq(customerEntitlements.id, seatCusEnt.id));

		const after = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entityId,
			{ skip_cache: "true" },
		);
		expect(after.balances[TestFeature.Messages].remaining).toBe(
			INCLUDED_MESSAGES,
		);
		expect(after.balances[TestFeature.Messages].usage).toBe(0);

		// next_reset_at advanced exactly per the naive calendar walk (the
		// Stripe-anchor clamp only ever raises it, and the parent's anchor
		// cannot exceed one interval from the planted value).
		const [seatCusEntAfter] = await ctx.db
			.select()
			.from(customerEntitlements)
			.where(eq(customerEntitlements.id, seatCusEnt.id));
		const expectedNextResetAt = getNextResetAt({
			curReset: new UTCDate(planted),
			interval: EntInterval.Month,
			intervalCount: 1,
		});
		expect(seatCusEntAfter.next_reset_at).toBe(expectedNextResetAt);
		expect(seatCusEntAfter.next_reset_at ?? 0).toBeGreaterThan(Date.now());
	},
);

test.concurrent(
	`${chalk.yellowBright("lazy reset (entity seat): expired parent blocks the reset via inherited status")}`,
	async () => {
		const customerId = "lazy-reset-seat-expired";
		const {
			ctx,
			autumnV1,
			autumnV2_3,
			entityId,
			parentCusProduct,
			seatCusEnt,
		} = await setupSeatScenario({
			customerId,
			idPrefix: "lazy-seat-expired",
		});

		await autumnV1.track(
			{
				customer_id: customerId,
				entity_id: entityId,
				feature_id: TestFeature.Messages,
				value: 30,
			},
			{ skipCache: true },
		);

		const planted = plantedEdgeResetAt();
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: planted })
			.where(eq(customerEntitlements.id, seatCusEnt.id));

		await CusProductService.update({
			ctx,
			cusProductId: parentCusProduct?.id ?? "",
			updates: { status: CusProductStatus.Expired },
		});

		// Entity fetch must NOT lazy-reset the seat: the inherited (expired)
		// parent status gates it out of the candidate set.
		await autumnV2_3.entities.get<ApiEntityV2>(customerId, entityId, {
			skip_cache: "true",
		});

		const [seatCusEntAfter] = await ctx.db
			.select()
			.from(customerEntitlements)
			.where(eq(customerEntitlements.id, seatCusEnt.id));
		expect(seatCusEntAfter.next_reset_at).toBe(planted);
		// Post-track balance survives untouched — no reset ran.
		expect(seatCusEntAfter.balance).toBe(INCLUDED_MESSAGES - 30);
	},
);
