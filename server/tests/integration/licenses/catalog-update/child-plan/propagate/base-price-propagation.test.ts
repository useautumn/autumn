/**
 * Contract: raising a license plan's base seat price propagates to parents
 * without charging anyone at migration time.
 *
 * A seat price change touches a Stripe subscription item, so it must run on the
 * per-customer lane — the batch lane rejects a priced `upsert_licenses`
 * (checkUpdatePlanOpEligibility.ts). It must also stay charge-free:
 * `assertNoChargeArtifacts` (processUpdatePlan.ts) throws if the computed plan
 * emits line items without `proration: true`. Customers pay the new rate at
 * their next cycle, matching how a plain base-price update behaves
 * (migrate.ts sets proration_behavior "none").
 *
 * A parent whose link overrides the price is excluded: the override pins its
 * own amount, so the base change never reaches it.
 */
import { expect, test } from "bun:test";
import { type ApiCustomerV3, BillingInterval } from "@autumn/shared";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import { generateId } from "@/utils/genUtils.js";

const ATTACHED_SEATS = 3;
const INCLUDED_SEATS = 1;
const SEAT_PRICE = 10;
const NEW_SEAT_PRICE = 20;
const OVERRIDE_SEAT_PRICE = 15;

const planIdsOf = (filter: unknown): string[] => {
	const matcher = (filter as { plan_id?: unknown })?.plan_id;
	if (typeof matcher === "string") return [matcher];
	return (matcher as { $in?: string[] })?.$in ?? [];
};

test(`${chalk.yellowBright("plans.update: a base seat price rise propagates per-customer without charging")}`, async () => {
	const idPrefix = "base-price-prop";
	const parentCustomerId = `${idPrefix}-parent-cus`;
	const overrideCustomerId = `${idPrefix}-override-cus`;

	const devSeat = products.base({
		id: "dev-seat",
		items: [
			items.monthlyPrice({ price: SEAT_PRICE }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
		group: `${idPrefix}-licenses`,
	});
	const pro = products.base({ id: "pro", items: [items.dashboard()] });
	const ent = products.base({ id: "ent", items: [items.dashboard()] });

	const { autumnV1, autumnV2_3, ctx } = await initScenario({
		customerId: parentCustomerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.otherCustomers([{ id: overrideCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro, ent, devSeat], prefix: idPrefix }),
		],
		actions: [
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: devSeat.id,
				included: INCLUDED_SEATS,
			}),
			// This parent pins its own seat price, so the base rise must skip it.
			s.licenses.link({
				parentProductId: ent.id,
				licenseProductId: devSeat.id,
				included: 1,
				customize: {
					price: {
						amount: OVERRIDE_SEAT_PRICE,
						interval: BillingInterval.Month,
					},
				},
			}),
			s.billing.attach({
				productId: pro.id,
				licenseQuantities: [
					{ licenseProductId: devSeat.id, quantity: ATTACHED_SEATS },
				],
			}),
			s.billing.attach({
				customerId: overrideCustomerId,
				productId: ent.id,
				licenseQuantities: [{ licenseProductId: devSeat.id, quantity: 2 }],
			}),
		],
	});

	const before = await autumnV1.customers.get<ApiCustomerV3>(parentCustomerId);
	const invoicesBefore = before.invoices?.length ?? 0;

	const response = await autumnV2_3.post("/plans.update", {
		plan_id: devSeat.id,
		price: { amount: NEW_SEAT_PRICE, interval: BillingInterval.Month },
		items: [itemsV2.monthlyMessages({ included: 100 })],
		disable_version: true,
		update_license_parents: [
			{ plan_id: pro.id, version: 1 },
			{ plan_id: ent.id, version: 1 },
		],
		migration: { draft: true },
	});

	// ── The draft carries the price, and admits it bills ───────────────
	const migrationId = response.migrations?.[0]?.id;
	expect(migrationId).toBeDefined();

	const [migration] = await migrationRepo.get({ ctx, id: migrationId });
	expect(migration?.no_billing_changes).toBe(false);

	const customerOps = migration?.operations?.customer ?? [];
	expect(customerOps).toHaveLength(1);
	const op = customerOps[0];
	if (op?.type !== "update_plan") throw new Error("expected update_plan");

	expect(op.customize?.upsert_licenses?.[0]?.customize?.price).toMatchObject({
		amount: NEW_SEAT_PRICE,
	});

	// ── The overriding parent is not in the migration ──────────────────
	expect(planIdsOf(op.plan_filter)).toEqual([pro.id]);
	expect(planIdsOf(op.plan_filter)).not.toContain(ent.id);

	// ── It runs per-customer, since it touches Stripe ──────────────────
	const result = await runMigrationInChunks({
		ctx,
		migration,
		migrationRunId: generateId("mrun"),
		dryRun: false,
	});
	expect(result.lane).toBe("per_customer");

	// ── Charge-free: the new rate lands next cycle, not now ────────────
	const after = await autumnV1.customers.get<ApiCustomerV3>(parentCustomerId);
	expect(after.invoices?.length ?? 0).toBe(invoicesBefore);

	// ── The customer's effective seat price really is the new one ──────
	const { pools } = await getLicenseDbState({
		db: ctx.db,
		customerId: parentCustomerId,
	});
	const planLicenseId = pools[0]?.plan_license_id;
	expect(planLicenseId).toBeTruthy();

	const link = await ctx.db.query.planLicenses.findFirst({
		where: (planLicense, { eq }) => eq(planLicense.id, planLicenseId as string),
	});
	expect(link?.is_custom).toBe(true);

	// Seat quantity survives the price swap.
	expect(pools[0]?.granted).toBe(ATTACHED_SEATS);

	// ── The PAID seats reprice on Stripe, so next cycle bills the new
	// rate. Included seats are free and must not add anything. ─────────
	const customerRow = await ctx.db.query.customers.findFirst({
		where: (customer, { eq }) => eq(customer.id, parentCustomerId),
	});
	const customerProducts = await ctx.db.query.customerProducts.findMany({
		where: (customerProduct, { eq }) =>
			eq(customerProduct.internal_customer_id, customerRow?.internal_id ?? ""),
	});
	const subscriptionIds = [
		...new Set(
			customerProducts.flatMap(
				(customerProduct) => customerProduct.subscription_ids ?? [],
			),
		),
	];
	expect(subscriptionIds.length).toBeGreaterThan(0);

	const seatLineTotals: number[] = [];
	for (const subscriptionId of subscriptionIds) {
		const subscription =
			await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
		for (const item of subscription.items.data) {
			const unitAmount = item.price.unit_amount ?? 0;
			if (unitAmount === 0) continue;
			seatLineTotals.push((unitAmount / 100) * (item.quantity ?? 0));
		}
	}

	const paidSeats = ATTACHED_SEATS - INCLUDED_SEATS;
	expect(seatLineTotals).toContain(paidSeats * NEW_SEAT_PRICE);
});
