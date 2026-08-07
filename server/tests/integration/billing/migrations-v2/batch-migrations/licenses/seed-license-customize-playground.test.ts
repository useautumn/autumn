/**
 * Seeds a license playground and LEAVES IT IN THE DB for manual testing.
 * Runs no migration and asserts nothing — it just builds the state and prints
 * the ids plus a ready-to-paste migration op.
 *
 * Run:
 *   cd server
 *   ./run.sh <abs path to this file>
 *
 * Then drive the migration yourself (dashboard or API) using the printed op,
 * and re-run this file any time to reset the playground to a clean state.
 *
 * What it builds, for customer `license-playground`:
 *   - plan `lic-play-pro`       parent, carries `words`
 *   - plan `lic-play-dev-seat`  license plan, $20/mo + 500 messages per seat
 *   - 3 seats attached (1 included + 2 paid), 2 assigned to entities
 *
 * The migration to try adds a free boolean `dashboard` to the license link.
 * Neither plan carries `dashboard` at seed time, so any appearance of it on an
 * assignment is unambiguously the migration's doing.
 */
import { test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const CUSTOMER_ID = "license-playground";
const ID_PREFIX = "lic-play";
const SEAT_PRICE = 20;
const SEAT_MESSAGES = 500;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

const heading = (label: string) =>
	console.log(
		`\n${chalk.cyanBright(`── ${label} ${"─".repeat(Math.max(0, 58 - label.length))}`)}`,
	);

test(`${chalk.yellowBright("SEED: license customize playground")}`, async () => {
	const scenario = await setupLicenseUpdateScenario({
		customerId: CUSTOMER_ID,
		idPrefix: ID_PREFIX,
		parentItems: [items.monthlyWords({ includedUsage: 100 })],
		seatPrice: SEAT_PRICE,
		seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, parent, devSeat } = scenario;
	const { pools, assignments } = await getLicenseDbState({
		db: ctx.db,
		customerId: CUSTOMER_ID,
	});
	const live = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	const entitlementRows = live.length
		? await ctx.db
				.select({ featureId: customerEntitlements.internal_feature_id })
				.from(customerEntitlements)
				.where(
					inArray(
						customerEntitlements.customer_product_id,
						live.map((assignment) => assignment.id),
					),
				)
		: [];

	heading("SEEDED");
	console.log(`customer         ${CUSTOMER_ID}`);
	console.log(`parent plan      ${parent.id}`);
	console.log(`license plan     ${devSeat.id}`);
	const entityIds = Array.from(
		{ length: ASSIGNED_SEATS },
		(_, index) => `${ID_PREFIX}-entity-${index + 1}`,
	);
	console.log(`entities         ${entityIds.join(", ")}`);

	heading("CURRENT STATE");
	console.log(`pool id              ${pools[0]?.id}`);
	console.log(`pool link_id         ${pools[0]?.link_id}`);
	console.log(`pool plan_license_id ${pools[0]?.plan_license_id}`);
	console.log(
		`pool granted/paid    ${pools[0]?.granted} / ${pools[0]?.paid_quantity}`,
	);
	console.log(`live assignments     ${live.length}`);
	console.log(`assignment ent rows  ${entitlementRows.length}`);

	heading("MIGRATION TO RUN");
	console.log(
		JSON.stringify(
			{
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
				no_billing_changes: true,
			},
			null,
			2,
		),
	);

	heading("EXPECTED AFTER MIGRATING");
	console.log(`pool.plan_license_id  changes (repointed to an is_custom row)`);
	console.log(`pool.link_id          unchanged (${pools[0]?.link_id})`);
	console.log(
		`assignment ent rows   ${entitlementRows.length} -> ${entitlementRows.length + live.length} (one '${TestFeature.Dashboard}' per assignment)`,
	);
	console.log(`invoices              unchanged (free entitlement)`);

	heading("RE-READ STATE LATER");
	console.log(
		`./run.sh $(pwd)/tests/integration/billing/migrations-v2/batch-migrations/licenses/seed-license-customize-playground.test.ts`,
	);
	console.log("(re-running resets the playground to this clean state)");
});
