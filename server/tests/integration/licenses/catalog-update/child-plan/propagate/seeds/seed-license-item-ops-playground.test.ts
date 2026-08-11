/**
 * Seeds a license plan with live seat assignments and LEAVES IT IN THE DB for
 * manual testing of the three batch verbs. Runs no migration and asserts
 * nothing.
 *
 * Run:
 *   cd server
 *   ./run.sh <abs path to this file>
 *
 * What it builds, for customer `lic-ops-customer`:
 *   - plan `pro_lic-ops`       parent, 1 included seat, 3 attached
 *   - plan `dev-seat_lic-ops`  the license plan, granting:
 *       messages  100/month   ← edit or delete this one
 *       words     50/month    ← the control: must survive either way
 *   - 2 seats assigned to entities, each holding both features
 *
 * One of the assignments has its messages balance spent down to 40, so an edit
 * has to credit the delta rather than reset it.
 */
import { test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";

const CUSTOMER_ID = "lic-ops-customer";
const ID_PREFIX = "lic-ops";
const SEAT_MESSAGES = 100;
const SEAT_WORDS = 50;
const CONSUMED_TO = 40;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

const heading = (label: string) =>
	console.log(
		`\n${chalk.cyanBright(`── ${label} ${"─".repeat(Math.max(0, 58 - label.length))}`)}`,
	);

test(`${chalk.yellowBright("SEED: license item add/edit/delete playground")}`, async () => {
	const scenario = await setupLicenseUpdateScenario({
		customerId: CUSTOMER_ID,
		idPrefix: ID_PREFIX,
		seatItems: [
			items.monthlyMessages({ includedUsage: SEAT_MESSAGES }),
			items.monthlyWords({ includedUsage: SEAT_WORDS }),
		],
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

	// Spend one assignment's messages down, so an edit must preserve
	// consumption. Words is left alone as the control.
	await ctx.db
		.update(customerEntitlements)
		.set({ balance: CONSUMED_TO })
		.where(
			and(
				eq(customerEntitlements.customer_product_id, live[0]?.id ?? ""),
				eq(customerEntitlements.feature_id, TestFeature.Messages),
			),
		);

	const rows = await ctx.db
		.select({
			customerProductId: customerEntitlements.customer_product_id,
			featureId: customerEntitlements.feature_id,
			balance: customerEntitlements.balance,
		})
		.from(customerEntitlements)
		.where(
			inArray(
				customerEntitlements.customer_product_id,
				live.map((assignment) => assignment.id),
			),
		);

	heading("SEEDED");
	console.log(`customer         ${CUSTOMER_ID}`);
	console.log(`parent plan      ${parent.id}`);
	console.log(`license plan     ${devSeat.id}   (edit THIS one)`);
	console.log(
		`pool granted     ${pools[0]?.granted} (${INCLUDED_SEATS} included)`,
	);
	console.log(`live assignments ${live.length}`);
	for (const row of rows) {
		console.log(
			`   ${row.customerProductId}  ${row.featureId} = ${row.balance}`,
		);
	}

	heading("MIGRATION OPS TO TRY");
	const opFor = (customize: Record<string, unknown>) =>
		JSON.stringify(
			{
				filter: { customer: { plan: { plan_id: parent.id, custom: false } } },
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: parent.id, custom: false },
							customize: {
								upsert_licenses: [{ license_plan_id: devSeat.id, customize }],
							},
						},
					],
				},
				no_billing_changes: true,
			},
			null,
			2,
		);

	console.log(chalk.bold("\nADD — a feature the seat does not grant:"));
	console.log(opFor({ add_items: [{ feature_id: TestFeature.Dashboard }] }));

	console.log(
		chalk.bold(`\nEDIT — ${TestFeature.Messages} ${SEAT_MESSAGES} -> 200:`),
	);
	console.log(
		opFor({
			add_items: [
				{
					feature_id: TestFeature.Messages,
					included: 200,
					reset: { interval: "month" },
				},
			],
			remove_items: [
				{
					feature_id: TestFeature.Messages,
					interval: "month",
					interval_count: 1,
				},
			],
		}),
	);

	console.log(chalk.bold(`\nDELETE — drop ${TestFeature.Messages}:`));
	console.log(opFor({ remove_items: [{ feature_id: TestFeature.Messages }] }));

	heading("EXPECTED AFTER EACH");
	console.log("ADD      every assignment gains one dashboard row; lane batch");
	console.log(
		`EDIT     messages becomes 200 and ${CONSUMED_TO} -> 140 on the spent one;`,
	);
	console.log("         consumption preserved, not reset; lane batch");
	console.log("DELETE   messages rows gone, words rows untouched; lane batch");
	console.log("");
	console.log(`words stays ${SEAT_WORDS} throughout — it is the control.`);

	heading("RE-SEED");
	console.log(
		`./run.sh $(pwd)/tests/integration/licenses/catalog-update/child-plan/propagate/seeds/seed-license-item-ops-playground.test.ts`,
	);
});
