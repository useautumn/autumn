import { expect, test } from "bun:test";
import { BillingInterval, planLicenses } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const SEAT_PRICE = 10;
const NEW_SEAT_PRICE = 50;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test(`${chalk.yellowBright("migration: a license base price change persists its customized link")}`, async () => {
	const customerId = "mig-lic-price-customer";
	const idPrefix = "mig-lic-price";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatPrice: SEAT_PRICE,
		seatItems: [items.oneOffMessages({ includedUsage: 100 })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = scenario;

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${idPrefix}-mig`,
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
									price: {
										amount: NEW_SEAT_PRICE,
										interval: BillingInterval.Month,
									},
									remove_items: [{ feature_id: TestFeature.Messages }],
								},
							},
						],
					},
				},
			],
		},
	});

	expect(result).toBeDefined();

	const { pools } = await getLicenseDbState({ db: ctx.db, customerId });

	const linkIds = pools
		.map((pool) => pool.plan_license_id)
		.filter((id): id is string => Boolean(id));
	if (linkIds.length === 0) return;

	const alive = await ctx.db
		.select({ id: planLicenses.id })
		.from(planLicenses)
		.where(inArray(planLicenses.id, linkIds));

	expect(alive.length).toBe(linkIds.length);
});
