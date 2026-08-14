/**
 * A remove aimed at one license plan must not touch a sibling license plan that
 * grants the same feature under the same parent.
 *
 * The DELETE matches on definition.feature_id and reaches assignments through
 * the canonical pool LATERAL. Whether the sibling is excluded rests entirely on
 * that LATERAL filtering by license_internal_product_id — there is no
 * plan_license_id predicate on the assignment join.
 */
import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const SEAT_MESSAGES = 100;
const SIBLING_MESSAGES = 300;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 2;

test(`${chalk.yellowBright("batch-license-customize: removing an item spares a sibling license plan")}`, async () => {
	const customerId = "batch-sibling-plan-customer";
	const idPrefix = "batch-sibling-plan";

	const parent = products.base({
		id: `${idPrefix}-pro`,
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: `${idPrefix}-dev-seat`,
		items: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
		group: `${idPrefix}-dev-seat-licenses`,
	});
	const supportSeat = products.base({
		id: `${idPrefix}-support-seat`,
		items: [items.monthlyMessages({ includedUsage: SIBLING_MESSAGES })],
		group: `${idPrefix}-support-seat-licenses`,
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [parent, devSeat, supportSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: devSeat.id,
				included: INCLUDED_SEATS,
			}),
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: supportSeat.id,
				included: INCLUDED_SEATS,
			}),
			s.billing.attach({
				productId: parent.id,
				licenseQuantities: [
					{ licenseProductId: devSeat.id, quantity: ATTACHED_SEATS },
					{ licenseProductId: supportSeat.id, quantity: ATTACHED_SEATS },
				],
			}),
			s.licenses.assign({
				licenseProductId: devSeat.id,
				entityIndexes: [0],
			}),
			s.licenses.assign({
				licenseProductId: supportSeat.id,
				entityIndexes: [1],
			}),
		],
	});

	const { ctx, autumnV2_2 } = scenario;
	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const live = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(live.length).toBeGreaterThanOrEqual(2);

	const rowsFor = async (assignmentIds: string[]) => {
		const rows = await ctx.db
			.select({
				customerProductId: customerEntitlements.customer_product_id,
				featureId: customerEntitlements.feature_id,
			})
			.from(customerEntitlements)
			.where(inArray(customerEntitlements.customer_product_id, assignmentIds));
		return rows.filter((row) => row.featureId === TestFeature.Messages);
	};

	const allIds = live.map((assignment) => assignment.id);
	const before = await rowsFor(allIds);
	expect(before.length).toBeGreaterThanOrEqual(2);

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
									remove_items: [{ feature_id: TestFeature.Messages }],
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

	const converged = await pollUntil({
		fetch: () => rowsFor(allIds),
		until: (rows) => rows.length < before.length,
		timeoutMs: 15_000,
		intervalMs: 250,
	});

	// The sibling plan's assignment keeps its own grant.
	expect(converged.length).toBeGreaterThan(0);
});
