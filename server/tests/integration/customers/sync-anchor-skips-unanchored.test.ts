/**
 * Sync anchor runs on every customer entitlement of a feature at once, so a
 * free plan on an entity with no paid plan to follow must be skipped instead
 * of failing the rows that do have a Stripe anchor.
 */
import { expect, test } from "bun:test";
import { customerEntitlements, type FullCustomer, ms } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { syncCustomerEntitlementAnchors } from "@/internal/customers/cusProducts/cusEnts/actions/syncCustomerEntitlementAnchors.js";

const STRIPE_ANCHOR_PRECISION_MS = ms.minutes(1);

const findMessagesEntitlement = ({
	fullCustomer,
	productId,
}: {
	fullCustomer: FullCustomer;
	productId: string;
}) => {
	const customerProduct = fullCustomer.customer_products.find(
		(candidate) => candidate.product.id === productId,
	);
	const customerEntitlement = customerProduct?.customer_entitlements.find(
		(candidate) => candidate.entitlement.feature.id === TestFeature.Messages,
	);
	if (!customerEntitlement) {
		throw new Error(`messages entitlement missing for ${productId}`);
	}
	return customerEntitlement;
};

const getNextResetAt = async ({
	ctx,
	customerEntitlementId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerEntitlementId: string;
}) => {
	const [row] = await ctx.db
		.select({ next_reset_at: customerEntitlements.next_reset_at })
		.from(customerEntitlements)
		.where(eq(customerEntitlements.id, customerEntitlementId));
	return row?.next_reset_at ?? null;
};

test.concurrent(
	`${chalk.yellowBright("sync anchor: skips a free entity plan with no anchor and syncs the paid one")}`,
	async () => {
		const customerId = "sync-anchor-skips-unanchored";
		const paid = products.pro({
			id: "sync-anchor-paid",
			items: [items.consumableMessages()],
		});
		const free = products.base({
			id: "sync-anchor-free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [paid, free] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: paid.id, entityIndex: 0 }),
				s.billing.attach({ productId: free.id, entityIndex: 1 }),
			],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const paidEntitlement = findMessagesEntitlement({
			fullCustomer,
			productId: paid.id,
		});
		const freeEntitlement = findMessagesEntitlement({
			fullCustomer,
			productId: free.id,
		});
		const paidNextResetAt = paidEntitlement.next_reset_at;
		const freeNextResetAt = freeEntitlement.next_reset_at;
		expect(paidNextResetAt).not.toBeNull();

		// Simulate the paid row drifting off its Stripe anchor.
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: Date.now() - ms.days(1) })
			.where(eq(customerEntitlements.id, paidEntitlement.id));

		const result = await syncCustomerEntitlementAnchors({
			ctx,
			customerEntitlementIds: [paidEntitlement.id, freeEntitlement.id],
		});
		expect(result).toEqual({ updated: 1, skipped: 1 });

		const syncedPaidNextResetAt = await getNextResetAt({
			ctx,
			customerEntitlementId: paidEntitlement.id,
		});
		expect(
			Math.abs((syncedPaidNextResetAt ?? 0) - (paidNextResetAt ?? 0)),
		).toBeLessThanOrEqual(STRIPE_ANCHOR_PRECISION_MS);
		expect(
			await getNextResetAt({
				ctx,
				customerEntitlementId: freeEntitlement.id,
			}),
		).toBe(freeNextResetAt);

		// Alone, the unanchored row still reports why it cannot be synced.
		await expect(
			syncCustomerEntitlementAnchors({
				ctx,
				customerEntitlementIds: [freeEntitlement.id],
			}),
		).rejects.toThrow("No billing anchor to sync to");
	},
);
