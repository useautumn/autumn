/**
 * Editing a license plan after a batch migration has customized its link.
 *
 * The migration mints its own link and replaces that link's item set, moving the
 * catalog entitlement's only license reference off the catalog link. The next
 * plan save therefore deletes and re-creates that entitlement, while the link
 * rebase still resolves the target item against the pre-save plan and re-inserts
 * the id that was just dropped.
 *
 * Red: plans.update fails with license_entitlements_entitlement_fkey.
 * Green: the save succeeds and the link resolves to the live entitlement.
 */
import { expect, test } from "bun:test";
import {
	BillingInterval,
	entitlements,
	licenseEntitlements,
	planLicenses,
	products,
} from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";

const NEW_MESSAGES = 123;
const NEW_SEAT_PRICE = 20;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("plans.update: saving a license plan after a migration keeps its links resolvable")}`, async () => {
	const customerId = "plan-save-after-mig-customer";
	const idPrefix = "plan-save-after-mig";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatPrice: 10,
		seatItems: [items.dashboard()],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, autumnV2_3, parent, devSeat } = scenario;

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${idPrefix}-mig`,
		filter: { customer: { plan: { plan_id: parent.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: parent.id, custom: false },
					customize: {
						upsert_licenses: [
							{
								license_plan_id: devSeat.id,
								customize: {
									add_items: [{ feature_id: TestFeature.Dashboard }],
									remove_items: [{ feature_id: TestFeature.Dashboard }],
								},
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
	});
	expect(result?.lane).toBe("batch");

	await autumnV2_3.post("/plans.update", {
		plan_id: devSeat.id,
		price: { amount: NEW_SEAT_PRICE, interval: BillingInterval.Month },
		items: [itemsV2.monthlyMessages({ included: NEW_MESSAGES })],
		disable_version: true,
		update_license_parents: [{ plan_id: parent.id, version: 1 }],
	});

	// Every link the seat plan is referenced by must resolve to a live row.
	const [seatProduct] = await ctx.db
		.select({ internalId: products.internal_id })
		.from(products)
		.where(eq(products.id, devSeat.id));

	const links = await ctx.db
		.select({ id: planLicenses.id })
		.from(planLicenses)
		.where(
			eq(planLicenses.license_internal_product_id, seatProduct.internalId),
		);
	expect(links.length).toBeGreaterThan(0);

	const junctionRows = await ctx.db
		.select({ entitlementId: licenseEntitlements.entitlement_id })
		.from(licenseEntitlements)
		.where(
			inArray(
				licenseEntitlements.plan_license_id,
				links.map((link) => link.id),
			),
		);

	const referencedIds = junctionRows
		.map((row) => row.entitlementId)
		.filter((id): id is string => Boolean(id));
	if (referencedIds.length === 0) return;

	const alive = await ctx.db
		.select({ id: entitlements.id })
		.from(entitlements)
		.where(inArray(entitlements.id, referencedIds));

	expect(alive.length).toBe(referencedIds.length);
});
