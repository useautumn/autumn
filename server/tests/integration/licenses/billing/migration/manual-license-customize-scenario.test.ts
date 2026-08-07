/**
 * Manual scenario for license customize migrations — NOT an assertion suite.
 *
 * Builds a real customer with a parent plan, a linked license plan, and live
 * assignments, runs a migration whose op carries customize.upsert_licenses,
 * then prints the before/after state so the behaviour can be inspected by hand.
 *
 * Run:
 *   cd server
 *   ./run.sh <abs path to this file>
 *
 * Everything it creates is scoped to MANUAL_CUSTOMER_ID, so re-running is safe.
 */
import { test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const MANUAL_CUSTOMER_ID = "manual-license-customize";
const ID_PREFIX = "manual-lic";
const CATALOG_SEAT_PRICE = 20;
const SEAT_MESSAGES = 500;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

const heading = (label: string) =>
	console.log(
		`\n${chalk.cyanBright(`── ${label} ${"─".repeat(58 - label.length)}`)}`,
	);

test(`${chalk.yellowBright("MANUAL: license customize migration walkthrough")}`, async () => {
	const scenario = await setupLicenseUpdateScenario({
		customerId: MANUAL_CUSTOMER_ID,
		idPrefix: ID_PREFIX,
		seatPrice: CATALOG_SEAT_PRICE,
		seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;

	const readState = async () => {
		const { pools, assignments } = await getLicenseDbState({
			db: ctx.db,
			customerId: MANUAL_CUSTOMER_ID,
		});
		const live = assignments.filter((a) => a.internal_entity_id);
		const entitlementRows = live.length
			? await ctx.db
					.select({
						customerProductId: customerEntitlements.customer_product_id,
						featureId: customerEntitlements.internal_feature_id,
					})
					.from(customerEntitlements)
					.where(
						inArray(
							customerEntitlements.customer_product_id,
							live.map((a) => a.id),
						),
					)
			: [];
		return { pools, live, entitlementRows };
	};

	heading("SETUP");
	console.log(`customer            ${MANUAL_CUSTOMER_ID}`);
	console.log(`parent plan         ${parent.id}`);
	console.log(`license plan        ${devSeat.id}`);
	console.log(`attached / assigned ${ATTACHED_SEATS} / ${ASSIGNED_SEATS}`);

	const before = await readState();
	heading("BEFORE MIGRATION");
	console.log(`pool plan_license_id   ${before.pools[0]?.plan_license_id}`);
	console.log(
		`pool granted / paid    ${before.pools[0]?.granted} / ${before.pools[0]?.paid_quantity}`,
	);
	console.log(`live assignments       ${before.live.length}`);
	console.log(`assignment ent rows    ${before.entitlementRows.length}`);

	const operations = {
		customer: [
			{
				type: "update_plan" as const,
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
	};

	heading("MIGRATION OP");
	console.log(JSON.stringify(operations, null, 2));

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${ID_PREFIX}-migration`,
		customerId: MANUAL_CUSTOMER_ID,
		filter: { customer: { plan: { plan_id: parent.id, custom: false } } },
		operations,
		noBillingChanges: true,
	});

	const after = await readState();
	heading("AFTER MIGRATION");
	console.log(`pool plan_license_id   ${after.pools[0]?.plan_license_id}`);
	console.log(
		`pool granted / paid    ${after.pools[0]?.granted} / ${after.pools[0]?.paid_quantity}`,
	);
	console.log(`link_id (should match) ${after.pools[0]?.link_id}`);
	console.log(`live assignments       ${after.live.length}`);
	console.log(`assignment ent rows    ${after.entitlementRows.length}`);

	heading("WHAT TO LOOK FOR");
	console.log(
		"pool plan_license_id should CHANGE (repointed to is_custom row)",
	);
	console.log("assignment ent rows should GAIN one row per live assignment");
	console.log(
		`currently: plan_license_id ${before.pools[0]?.plan_license_id === after.pools[0]?.plan_license_id ? chalk.red("UNCHANGED") : chalk.green("changed")}, ent rows ${before.entitlementRows.length} -> ${after.entitlementRows.length}`,
	);
});
