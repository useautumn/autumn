/**
 * Deleting an item from a license plan should batch-lower, the same as adding
 * and editing one.
 *
 * A delete is a bare remove_items with no matching add. The batch guard
 * rejected it, prepare minted no artifact for it, and no remove action existed,
 * so it fell to the per-customer lane.
 *
 * Red-failure mode (current behavior):
 *  - the op is rejected as unsupported_upsert_licenses and runs per_customer
 *
 * Green-success criteria (after fix):
 *  - the op runs on the batch lane
 *  - every live assignment loses its row for the feature, balance and all
 *  - the license plan's other items survive
 *  - customers whose only change was the delete are not reported as skipped
 */
import { expect, test } from "bun:test";
import {
	customerEntitlements,
	entitlements,
	licenseEntitlements,
	migrationItemRuns,
	planLicenses,
	products,
} from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";

const SEAT_MESSAGES = 100;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: deleting an item batch-lowers and drops the rows")}`, async () => {
	const customerId = "batch-item-delete-customer";
	const idPrefix = "batch-item-delete";

	// The seat grants two features; only one is deleted, so the other proves
	// the delete is targeted rather than wholesale.
	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [
			items.monthlyMessages({ includedUsage: SEAT_MESSAGES }),
			items.dashboard(),
		],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;
	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

	const readRows = async () => {
		const rows = await ctx.db
			.select({
				featureId: customerEntitlements.feature_id,
				balance: customerEntitlements.balance,
			})
			.from(customerEntitlements)
			.where(
				inArray(
					customerEntitlements.customer_product_id,
					liveAssignments.map((assignment) => assignment.id),
				),
			);
		return rows;
	};

	const before = await readRows();
	expect(
		before.filter((row) => row.featureId === TestFeature.Messages),
	).toHaveLength(ASSIGNED_SEATS);

	const { result, migration } = await runChunkedMigration({
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
									remove_items: [{ feature_id: TestFeature.Messages }],
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

	// A deleted customer changed even though nothing was inserted. Marking it
	// skipped would skip its cache invalidation.
	const itemRuns = await ctx.db
		.select({ status: migrationItemRuns.status })
		.from(migrationItemRuns)
		.where(eq(migrationItemRuns.migration_internal_id, migration.internal_id));
	expect(itemRuns.length).toBeGreaterThan(0);
	expect(itemRuns.every((run) => run.status !== "skipped")).toBe(true);

	// ── The feature is gone from every assignment ──────────────────────
	const converged = await pollUntil({
		fetch: readRows,
		until: (rows) =>
			rows.filter((row) => row.featureId === TestFeature.Messages).length === 0,
		timeoutMs: 15_000,
		intervalMs: 250,
	});
	expect(
		converged.filter((row) => row.featureId === TestFeature.Messages),
	).toHaveLength(0);

	// ── The seat's other feature survives ──────────────────────────────
	expect(
		converged.filter((row) => row.featureId === TestFeature.Dashboard),
	).toHaveLength(ASSIGNED_SEATS);

	// ── The customized link stops carrying the deleted entitlement, or a
	// later assignment is granted it again ────────────────────────────
	const linkedFeatureIds = await ctx.db
		.select({ featureId: entitlements.feature_id })
		.from(licenseEntitlements)
		.innerJoin(
			entitlements,
			eq(licenseEntitlements.entitlement_id, entitlements.id),
		)
		.innerJoin(
			planLicenses,
			eq(licenseEntitlements.plan_license_id, planLicenses.id),
		)
		.innerJoin(
			products,
			eq(planLicenses.license_internal_product_id, products.internal_id),
		)
		.where(eq(products.id, devSeat.id));

	expect(
		linkedFeatureIds.filter((row) => row.featureId === TestFeature.Messages),
	).toHaveLength(0);
});
