/**
 * Seeds a license plan held BOTH ways and LEAVES IT IN THE DB for manual
 * testing. Runs no migration and asserts nothing.
 *
 * Run:
 *   cd server
 *   ./run.sh <abs path to this file>
 *
 * Editing the license plan here must produce TWO migrations, because two
 * distinct populations hold it:
 *   - seat assignments under the parent, reached via upsert_licenses
 *   - a customer holding the license plan directly, reached by plan id
 *
 * The seat-only playground produces one migration on purpose: a license-scoped
 * op cannot reach a seat assignment, so drafting one would only ever report
 * "no changes".
 */
import { test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";

const ID_PREFIX = "two-mig";
const SEAT_CUSTOMER_ID = `${ID_PREFIX}-seat-customer`;
const DIRECT_CUSTOMER_ID = `${ID_PREFIX}-direct-customer`;
const SEAT_MESSAGES = 100;
const SEAT_WORDS = 50;
const CONSUMED_TO = 40;

const heading = (label: string) =>
	console.log(
		`\n${chalk.cyanBright(`── ${label} ${"─".repeat(Math.max(0, 58 - label.length))}`)}`,
	);

test(`${chalk.yellowBright("SEED: license held by seats AND directly (two migrations)")}`, async () => {
	const scenario = await setupLicenseUpdateScenario({
		customerId: SEAT_CUSTOMER_ID,
		idPrefix: ID_PREFIX,
		seatItems: [
			items.monthlyMessages({ includedUsage: SEAT_MESSAGES }),
			items.monthlyWords({ includedUsage: SEAT_WORDS }),
		],
		includedSeats: 1,
		attachedSeats: 3,
	});
	await scenario.assignSeats({ count: 2 });

	const { ctx, autumnV2_3, parent, devSeat } = scenario;

	// The second population: a customer holding the license plan in its own
	// right, which only a plan-scoped migration can reach.
	await autumnV2_3.post("/customers", {
		id: DIRECT_CUSTOMER_ID,
		name: "Two Mig Direct",
	});
	await autumnV2_3.billing.attach({
		customer_id: DIRECT_CUSTOMER_ID,
		plan_id: devSeat.id,
	});

	const { assignments } = await getLicenseDbState({
		db: ctx.db,
		customerId: SEAT_CUSTOMER_ID,
	});
	const live = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);

	// Spend one seat's messages down so an edit must credit the delta.
	if (live[0]) {
		await ctx.db
			.update(customerEntitlements)
			.set({ balance: CONSUMED_TO })
			.where(
				and(
					eq(customerEntitlements.customer_product_id, live[0].id),
					eq(customerEntitlements.feature_id, TestFeature.Messages),
				),
			);
	}

	const seatRows = await ctx.db
		.select({
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
	console.log(`license plan     ${devSeat.id}   (edit THIS one)`);
	console.log(`parent plan      ${parent.id}`);
	console.log("");
	console.log(
		`seat customer    ${SEAT_CUSTOMER_ID}   ${live.length} assignments`,
	);
	for (const row of seatRows) {
		console.log(`   ${row.featureId} = ${row.balance}`);
	}
	console.log(
		`direct customer  ${DIRECT_CUSTOMER_ID}   holds ${devSeat.id} itself`,
	);

	heading("WHAT TO DO");
	console.log(`1. Open plan '${devSeat.id}' in the dashboard`);
	console.log(
		`2. Delete ${TestFeature.Messages} and change ${TestFeature.Words} to 30`,
	);
	console.log(`3. Save, tick '${parent.id}' in the Parents step, and migrate`);

	heading("EXPECTED: TWO MIGRATIONS");
	console.log(`1. plan_id ${devSeat.id}`);
	console.log(`   moves ${DIRECT_CUSTOMER_ID} — its own item diff`);
	console.log(`2. plan_id ${parent.id}`);
	console.log("   moves the seat assignments — upsert_licenses");
	console.log("");
	console.log("Both should report lane batch. After running both:");
	console.log(
		`   ${TestFeature.Messages} gone from the seats AND the direct customer`,
	);
	console.log(`   ${TestFeature.Words} = 30, with the spent seat credited`);

	heading("RE-SEED");
	console.log(
		"./run.sh $(pwd)/tests/integration/licenses/catalog-update/child-plan/propagate/seeds/seed-license-two-migration-playground.test.ts",
	);
});
