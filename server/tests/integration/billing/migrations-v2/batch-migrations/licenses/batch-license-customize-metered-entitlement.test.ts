/**
 * A license customize adding a free METERED entitlement must reach live
 * assignments with a real reset cycle, not a balance that never resets.
 *
 * Contract under test:
 *   New behaviors:
 *     - a resetting entitlement is batch-lowered (not rejected to per-customer)
 *     - each assignment's customer_entitlement carries the granted balance
 *     - reset_cycle_anchor / next_reset_at are populated, anchored to the
 *       parent the seat bills with — matching what attaching a seat produces
 *   Side effects:
 *     - no invoice: a free metered entitlement is not a billing change
 */
import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const CATALOG_SEAT_PRICE = 20;
const SEAT_MESSAGES = 500;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;
const ADDED_WORDS = 250;

test.concurrent(
	`${chalk.yellowBright("migrate-license-customize: metered entitlement lands with a reset cycle")}`,
	async () => {
		const customerId = "migrate-license-customize-metered";
		const idPrefix = "mig-lic-metered";

		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatPrice: CATALOG_SEAT_PRICE,
			seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});
		await scenario.assignSeats({ count: ASSIGNED_SEATS });

		const { ctx, autumnV1, autumnV2_2, parent, devSeat } = scenario;
		const { assignments: assignmentsBefore } = await getLicenseDbState({
			db: ctx.db,
			customerId,
		});
		const liveAssignments = assignmentsBefore.filter(
			(assignment) => assignment.internal_entity_id,
		);
		expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

		await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${idPrefix}-migration`,
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
										add_items: [
											itemsV2.monthlyWords({ included: ADDED_WORDS }),
										],
									},
								},
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});

		const pool = await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: true,
			isCustomized: true,
		});

		const meteredEntitlement = pool.planLicense?.product.entitlements.find(
			(entitlement) => entitlement.feature?.id === TestFeature.Words,
		);
		expect(meteredEntitlement).toBeDefined();

		const readAssignmentWordRows = async () => {
			const rows = await ctx.db
				.select({
					entitlementId: customerEntitlements.entitlement_id,
					featureId: customerEntitlements.internal_feature_id,
					balance: customerEntitlements.balance,
					resetCycleAnchor: customerEntitlements.reset_cycle_anchor,
					nextResetAt: customerEntitlements.next_reset_at,
				})
				.from(customerEntitlements)
				.where(
					inArray(
						customerEntitlements.customer_product_id,
						liveAssignments.map((assignment) => assignment.id),
					),
				);
			return rows.filter(
				(row) => row.featureId === meteredEntitlement?.internal_feature_id,
			);
		};

		const convergedRows = await pollUntil({
			fetch: readAssignmentWordRows,
			until: (rows) => rows.length === ASSIGNED_SEATS,
			timeoutMs: 15_000,
			intervalMs: 250,
		});
		expect(convergedRows).toHaveLength(ASSIGNED_SEATS);

		// The whole point: a metered row must track a balance AND reset.
		const { products } = await getLicenseDbState({ db: ctx.db, customerId });
		const parentProduct = products.find(
			(product) => !product.customer_license_link_id,
		);
		const parentAnchor =
			parentProduct?.billing_cycle_anchor ?? parentProduct?.starts_at ?? null;
		expect(parentAnchor).not.toBeNull();

		for (const row of convergedRows) {
			expect(row.entitlementId).toBe(meteredEntitlement?.id ?? "");
			expect(Number(row.balance)).toBe(ADDED_WORDS);
			expect(row.resetCycleAnchor).not.toBeNull();
			expect(row.nextResetAt).not.toBeNull();
			expect(Number(row.nextResetAt)).toBeGreaterThan(Date.now());
			expect(Number(row.resetCycleAnchor)).toBe(Number(parentAnchor));
		}

		// Replay: the migration must be idempotent. pollUntil returns on FIRST
		// convergence, so a duplicate row needs an exact count after re-running.
		await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${idPrefix}-migration-replay`,
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
										add_items: [
											itemsV2.monthlyWords({ included: ADDED_WORDS }),
										],
									},
								},
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});
		expect(await readAssignmentWordRows()).toHaveLength(ASSIGNED_SEATS);

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({ customer: customerV3, count: 1 });
	},
);
