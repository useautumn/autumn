import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { expectAssignmentsAnchoredToParent } from "@tests/integration/licenses/utils/expectAssignmentsAnchoredToParent";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
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
const PAID_SEATS = ATTACHED_SEATS - INCLUDED_SEATS;
const ASSIGNED_SEATS = 2;

test.concurrent(
	`${chalk.yellowBright("migrate-license-customize: bool entitlement lands on live assignments")}`,
	async () => {
		const customerId = "migrate-license-customize-bool";
		const idPrefix = "mig-lic-bool";

		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatPrice: CATALOG_SEAT_PRICE,
			seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});
		await scenario.assignSeats({ count: ASSIGNED_SEATS });

		const { ctx, autumnV1, autumnV2_2, autumnV2_3, parent, devSeat } = scenario;
		const { pools: poolsBefore, assignments: assignmentsBefore } =
			await getLicenseDbState({ db: ctx.db, customerId });
		const liveAssignments = assignmentsBefore.filter(
			(assignment) => assignment.internal_entity_id,
		);
		expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

		const parentPlanId = parent.id;
		const devSeatPlanId = devSeat.id;

		await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${idPrefix}-migration`,
			filter: { customer: { plan: { plan_id: parentPlanId, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: parentPlanId, custom: false },
						customize: {
							upsert_licenses: [
								{
									license_plan_id: devSeatPlanId,
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
		expect(poolsBefore).toHaveLength(1);
		expect(pool.id).toBe(poolsBefore[0].id);
		expect(pool.link_id).toBe(poolsBefore[0].link_id);

		const boolEntitlement = pool.planLicense?.product.entitlements.find(
			(entitlement) => entitlement.feature?.id === TestFeature.Dashboard,
		);
		expect(boolEntitlement).toBeDefined();

		expect(
			(pool.planLicense?.product.entitlements ?? [])
				.map((entitlement) => entitlement.feature?.id)
				.sort(),
		).toEqual([TestFeature.Dashboard, TestFeature.Messages].sort());

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: devSeat.id,
					parent_plan_id: parent.id,
					granted: ATTACHED_SEATS,
					usage: ASSIGNED_SEATS,
					remaining: ATTACHED_SEATS - ASSIGNED_SEATS,
					paid_quantity: PAID_SEATS,
				},
			],
		});

		await expectAssignmentsAnchoredToParent({
			ctx,
			customerId,
			parentPlanId: parent.id,
			count: ASSIGNED_SEATS,
		});

		const readAssignmentBoolRows = async () => {
			const rows = await ctx.db
				.select({
					entitlementId: customerEntitlements.entitlement_id,
					featureId: customerEntitlements.internal_feature_id,
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
				(row) => row.featureId === boolEntitlement?.internal_feature_id,
			);
		};

		const convergedRows = await pollUntil({
			fetch: readAssignmentBoolRows,
			until: (rows) => rows.length === ASSIGNED_SEATS,
			timeoutMs: 15_000,
			intervalMs: 250,
		});
		expect(convergedRows).toHaveLength(ASSIGNED_SEATS);
		for (const row of convergedRows) {
			expect(row.entitlementId).toBe(boolEntitlement?.id ?? "");
			expect(row.resetCycleAnchor).toBeNull();
			expect(row.nextResetAt).toBeNull();
		}

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({ customer: customerV3, count: 1 });
	},
);
