/**
 * A license customize resolves a reset cycle off the anchor ladder: a
 * same-interval sibling on the assignment, then the parent's billing anchor,
 * then the parent's Stripe subscription, then the parent's starts_at.
 *
 * Contract under test:
 *   New behaviors:
 *     - a sibling at the same interval wins: the minted row shares its anchor
 *     - with no sibling, a paid parent's rows anchor to the parent's cycle,
 *       never the seat's own
 *     - a free parent with no anchors falls back to the parent's starts_at
 *   Side effects:
 *     - every rung stays on the batch lane
 */

import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { pollUntil } from "@tests/utils/genUtils";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 2;
const ASSIGNED_SEATS = 2;
const ADDED_WORDS = 50;

const runRung = async ({
	idPrefix,
	parentItems,
	seatItems,
	seatPrice,
}: {
	idPrefix: string;
	parentItems?: Parameters<typeof setupLicenseUpdateScenario>[0]["parentItems"];
	seatItems?: Parameters<typeof setupLicenseUpdateScenario>[0]["seatItems"];
	seatPrice?: number;
}) => {
	const customerId = `${idPrefix}-customer`;
	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		parentItems,
		seatItems,
		seatPrice,
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;
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
						upsert_licenses: [
							{
								license_plan_id: devSeat.id,
								customize: {
									add_items: [itemsV2.monthlyWords({ included: ADDED_WORDS })],
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

	const { assignments, products } = await getLicenseDbState({
		db: ctx.db,
		customerId,
	});
	const liveAssignmentIds = assignments
		.filter((assignment) => assignment.internal_entity_id)
		.map((assignment) => assignment.id);

	const readRows = async () =>
		await ctx.db
			.select({
				featureId: customerEntitlements.feature_id,
				resetCycleAnchor: customerEntitlements.reset_cycle_anchor,
				customerProductId: customerEntitlements.customer_product_id,
			})
			.from(customerEntitlements)
			.where(
				inArray(customerEntitlements.customer_product_id, liveAssignmentIds),
			);

	const rows = await pollUntil({
		fetch: readRows,
		until: (candidates) =>
			candidates.filter((row) => row.featureId === TestFeature.Words).length ===
			ASSIGNED_SEATS,
		timeoutMs: 15_000,
		intervalMs: 250,
	});

	return {
		ctx,
		assignments,
		wordRows: rows.filter((row) => row.featureId === TestFeature.Words),
		parentProduct: products.find(
			(product) => !product.customer_license_link_id,
		),
	};
};

test(`${chalk.yellowBright("batch-license-cycles: a same-interval sibling anchors the minted row")}`, async () => {
	const { wordRows } = await runRung({
		idPrefix: "lic-rung-sibling",
		seatItems: [items.monthlyMessages({ includedUsage: 100 })],
	});

	expect(wordRows).toHaveLength(ASSIGNED_SEATS);
	for (const row of wordRows) {
		expect(row.resetCycleAnchor).not.toBeNull();
	}
});

test(`${chalk.yellowBright("batch-license-cycles: a paid parent anchors its seats to the parent cycle")}`, async () => {
	const { wordRows, parentProduct } = await runRung({
		idPrefix: "lic-rung-parent",
		parentItems: [items.dashboard(), items.monthlyPrice({ price: 20 })],
		seatPrice: 10,
	});

	const parentAnchor =
		parentProduct?.billing_cycle_anchor ?? parentProduct?.starts_at ?? null;
	expect(parentAnchor).not.toBeNull();
	expect(wordRows).toHaveLength(ASSIGNED_SEATS);
	for (const row of wordRows) {
		expect(Number(row.resetCycleAnchor)).toBe(Number(parentAnchor));
	}
});

test(`${chalk.yellowBright("batch-license-cycles: a free parent falls back to its starts_at")}`, async () => {
	const { wordRows, parentProduct } = await runRung({
		idPrefix: "lic-rung-free",
	});

	expect(parentProduct?.billing_cycle_anchor ?? null).toBeNull();
	expect(wordRows).toHaveLength(ASSIGNED_SEATS);
	for (const row of wordRows) {
		expect(Number(row.resetCycleAnchor)).toBe(Number(parentProduct?.starts_at));
	}
});
