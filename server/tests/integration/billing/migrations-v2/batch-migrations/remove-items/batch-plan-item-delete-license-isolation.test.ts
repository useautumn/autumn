/**
 * Removing a free item from a parent plan must not touch its seat
 * assignments, even when the license plan grants the same feature.
 *
 * Seats hold rows minted from the license product, so a parent removal is
 * not theirs to lose. Three separate mechanisms keep them out of scope
 * (internal_product_id, distinct entitlement ids, customer_license_link_id
 * IS NULL); this pins the observable outcome.
 */
import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const MESSAGES_INCLUDED = 100;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("batch migration: a parent item delete spares the license seats")}`, async () => {
	const customerId = "batch-delete-license-isolation";
	const idPrefix = "batch-delete-lic-iso";

	// Both the parent and the seat grant messages, so an over-broad delete
	// would take the seats' rows with the parent's.
	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		parentItems: [items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED })],
		seatItems: [items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent } = scenario;
	const { assignments, pools } = await getLicenseDbState({
		db: ctx.db,
		customerId,
	});
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

	const assignmentIds = liveAssignments.map((assignment) => assignment.id);
	const readSeatMessageRows = async () => {
		const rows = await ctx.db
			.select({ featureId: customerEntitlements.feature_id })
			.from(customerEntitlements)
			.where(inArray(customerEntitlements.customer_product_id, assignmentIds));
		return rows.filter((row) => row.featureId === TestFeature.Messages);
	};

	expect(await readSeatMessageRows()).toHaveLength(ASSIGNED_SEATS);
	const grantedBefore = pools.map((pool) => pool.granted);

	const { result } = await runChunkedMigration({
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
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");

	// ── The parent's own row goes ──────────────────────────────────────
	const parentRows = await pollUntil({
		fetch: async () => {
			const { products: customerProducts } = await getLicenseDbState({
				db: ctx.db,
				customerId,
			});
			const parentIds = customerProducts
				.filter((product) => !product.customer_license_link_id)
				.map((product) => product.id);
			if (parentIds.length === 0) return [];
			return ctx.db
				.select({ featureId: customerEntitlements.feature_id })
				.from(customerEntitlements)
				.where(inArray(customerEntitlements.customer_product_id, parentIds));
		},
		until: (rows) =>
			rows.filter((row) => row.featureId === TestFeature.Messages).length === 0,
		timeoutMs: 15_000,
		intervalMs: 250,
	});
	expect(
		parentRows.filter((row) => row.featureId === TestFeature.Messages),
	).toHaveLength(0);

	// ── The seats keep theirs, and the pool is untouched ───────────────
	expect(await readSeatMessageRows()).toHaveLength(ASSIGNED_SEATS);

	const { pools: poolsAfter } = await getLicenseDbState({
		db: ctx.db,
		customerId,
	});
	expect(poolsAfter.map((pool) => pool.granted)).toEqual(grantedBefore);
});
