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
	`${chalk.yellowBright("batch-license-customize: re-adding an existing feature supersedes the base item")}`,
	async () => {
		const customerId = "migrate-license-existing-feature";
		const idPrefix = "mig-lic-exist";

		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatPrice: CATALOG_SEAT_PRICE,
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
									customize: { add_items: [itemsV2.dashboard()] },
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

		const definitionEntitlements = pool.planLicense?.product.entitlements ?? [];
		const dashboardEntitlements = definitionEntitlements.filter(
			(entitlement) => entitlement.feature?.id === TestFeature.Dashboard,
		);
		expect(dashboardEntitlements).toHaveLength(1);

		expect(dashboardEntitlements[0]?.is_custom).toBe(true);

		expect(
			definitionEntitlements
				.map((entitlement) => entitlement.feature?.id)
				.sort(),
		).toEqual([TestFeature.Dashboard, TestFeature.Messages].sort());

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
			return rows.filter((row) => row.featureId === TestFeature.Dashboard);
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
