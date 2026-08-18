/**
 * Same supersession rule, but the base item is PRICED. A price ref carries the
 * same entitlement id, so skipping priced refs leaves the base entitlement in
 * the set and grants the feature twice.
 *
 * replaceItems swaps the whole item set, so prepare carries the license plan's
 * base item refs forward. Those refs key on entitlement id, and the minted
 * entitlement has a different id — so without deduping on the feature the
 * customized link ends up granting the same feature twice.
 *
 * Contract under test:
 *   - the customized definition carries exactly ONE entitlement for the feature
 *   - it is the prepared (minted) entitlement, not the base one
 *   - the license plan's other base items survive
 *   - each live assignment gains exactly one row for the feature
 */
import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
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

test.concurrent(
	`${chalk.yellowBright("batch-license-customize: re-adding a priced feature supersedes its base item")}`,
	async () => {
		const customerId = "probe-priced-dup";
		const idPrefix = "probe-priced";

		// The license plan ALREADY grants `dashboard` — this is the whole point.
		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatPrice: CATALOG_SEAT_PRICE,
			seatItems: [
				items.prepaidMessages({
					includedUsage: 100,
					billingUnits: 100,
					price: 5,
				}),
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
										add_items: [itemsV2.monthlyMessages({ included: 250 })],
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

		// ── The definition grants the feature exactly once ──────────────────
		const definitionEntitlements = pool.planLicense?.product.entitlements ?? [];
		const messagesEntitlements = definitionEntitlements.filter(
			(entitlement) => entitlement.feature?.id === TestFeature.Messages,
		);
		expect(messagesEntitlements).toHaveLength(1);

		// The surviving one is the prepared row, not the base it replaced.
		expect(messagesEntitlements[0]?.is_custom).toBe(true);

		// The plan's other base items are untouched.
		expect(
			definitionEntitlements
				.map((entitlement) => entitlement.feature?.id)
				.sort(),
		).toEqual([TestFeature.Messages].sort());

		// ── One row per assignment, not two ────────────────────────────────
		const readDashboardRows = async () => {
			const rows = await ctx.db
				.select({
					customerProductId: customerEntitlements.customer_product_id,
					featureId: customerEntitlements.feature_id,
				})
				.from(customerEntitlements)
				.where(
					inArray(
						customerEntitlements.customer_product_id,
						liveAssignments.map((assignment) => assignment.id),
					),
				);
			return rows.filter((row) => row.featureId === TestFeature.Messages);
		};

		const converged = await pollUntil({
			fetch: readDashboardRows,
			until: (rows) => rows.length >= ASSIGNED_SEATS,
			timeoutMs: 15_000,
			intervalMs: 250,
		});
		expect(converged).toHaveLength(ASSIGNED_SEATS);
	},
);
