/**
 * A license customize scoped to one plan must not leak onto customers of a
 * different plan that links the SAME license product, nor mutate the catalog
 * definition those customers still inherit.
 *
 * Two plans linking one license product hold separate plan_license rows
 * (unique_plan_license is keyed on the pair), so the isolation comes from the
 * repoint touching only the targeted plan's row — this pins that down.
 *
 * Contract under test:
 *   - only the targeted plan's pool repoints onto an is_custom definition
 *   - the untargeted plan's pool keeps pointing at its catalog definition
 *   - the untargeted plan's assignments never gain the added entitlement
 *   - the untargeted plan's catalog plan_license row is not mutated in place
 */
import { expect, test } from "bun:test";
import type {
	AttachLicenseParamsV0,
	AttachParamsV1Input,
} from "@autumn/shared";
import { customerEntitlements, planLicenses } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";

const ID_PREFIX = "mig-lic-iso";
const TARGET_CUSTOMER = `${ID_PREFIX}-target`;
const BYSTANDER_CUSTOMER = `${ID_PREFIX}-bystander`;
const INCLUDED_SEATS = 2;
const SEAT_MESSAGES = 500;

const seatPlan = products.base({
	id: `${ID_PREFIX}-seat`,
	items: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
	group: `${ID_PREFIX}-seat-licenses`,
});
const targetPlan = products.base({
	id: `${ID_PREFIX}-pro`,
	items: [items.monthlyWords({ includedUsage: 100 })],
});
const bystanderPlan = products.base({
	id: `${ID_PREFIX}-premium`,
	items: [items.monthlyWords({ includedUsage: 200 })],
});

const assignSeat = async ({
	client,
	customerId,
	entityId,
}: {
	client: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
	entityId: string;
}) =>
	client.licenses.attach<AttachLicenseParamsV0>({
		customer_id: customerId,
		plan_id: seatPlan.id,
		entities: [
			{ entity_id: entityId, name: entityId, feature_id: TestFeature.Users },
		],
	});

test.concurrent(
	`${chalk.yellowBright("batch-license-customize: a plan-scoped customize leaves other plans' licenses untouched")}`,
	async () => {
		// One catalog, both plans linking the same license product.
		const target = await initScenario({
			customerId: TARGET_CUSTOMER,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({
					list: [targetPlan, bystanderPlan, seatPlan],
					prefix: ID_PREFIX,
				}),
			],
			actions: [
				s.licenses.link({
					parentProductId: targetPlan.id,
					licenseProductId: seatPlan.id,
					included: INCLUDED_SEATS,
				}),
				s.licenses.link({
					parentProductId: bystanderPlan.id,
					licenseProductId: seatPlan.id,
					included: INCLUDED_SEATS,
				}),
				s.billing.attach({
					productId: targetPlan.id,
					licenseQuantities: [
						{ licenseProductId: seatPlan.id, quantity: INCLUDED_SEATS },
					],
				}),
			],
		});
		await assignSeat({
			client: target.autumnV2_3,
			customerId: TARGET_CUSTOMER,
			entityId: `${ID_PREFIX}-target-entity`,
		});

		// Second customer on the OTHER plan, sharing the same license product.
		await target.autumnV1.customers.create({ id: BYSTANDER_CUSTOMER });
		await target.autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: BYSTANDER_CUSTOMER,
			plan_id: bystanderPlan.id,
			redirect_mode: "if_required",
			license_quantities: [
				{ license_plan_id: seatPlan.id, quantity: INCLUDED_SEATS },
			],
		});
		await assignSeat({
			client: target.autumnV2_3,
			customerId: BYSTANDER_CUSTOMER,
			entityId: `${ID_PREFIX}-bystander-entity`,
		});

		const { ctx } = target;
		const targetState = await getLicenseDbState({
			db: ctx.db,
			customerId: TARGET_CUSTOMER,
		});
		const bystanderState = await getLicenseDbState({
			db: ctx.db,
			customerId: BYSTANDER_CUSTOMER,
		});

		const targetAssignments = targetState.assignments.filter(
			(assignment) => assignment.internal_entity_id,
		);
		const bystanderAssignments = bystanderState.assignments.filter(
			(assignment) => assignment.internal_entity_id,
		);
		expect(targetAssignments.length).toBeGreaterThan(0);
		expect(bystanderAssignments.length).toBeGreaterThan(0);

		const catalogPlanLicenseId = bystanderState.pools[0]?.plan_license_id;
		expect(catalogPlanLicenseId).toBeTruthy();
		// Both plans link the same license product but hold their own catalog row.
		const catalogRowBefore = await ctx.db
			.select()
			.from(planLicenses)
			.where(eq(planLicenses.id, catalogPlanLicenseId ?? ""));
		expect(catalogRowBefore[0]?.is_custom).toBe(false);

		// ── Migrate: customize the license, scoped to the TARGET plan only ──
		await runChunkedMigration({
			ctx,
			migrationClient: target.autumnV2_2,
			migrationId: `${ID_PREFIX}-migration`,
			filter: { customer: { plan: { plan_id: targetPlan.id, custom: false } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: targetPlan.id, custom: false },
						customize: {
							upsert_licenses: [
								{
									license_plan_id: seatPlan.id,
									customize: { add_items: [itemsV2.dashboard()] },
								},
							],
						},
					},
				],
			},
			noBillingChanges: true,
		});

		const readDashboardRows = async (assignmentIds: string[]) => {
			const rows = await ctx.db
				.select({
					customerProductId: customerEntitlements.customer_product_id,
					featureId: customerEntitlements.feature_id,
				})
				.from(customerEntitlements)
				.where(
					inArray(customerEntitlements.customer_product_id, assignmentIds),
				);
			return rows.filter((row) => row.featureId === TestFeature.Dashboard);
		};

		// ── The target's assignments converge onto the new entitlement ──────
		const targetRows = await pollUntil({
			fetch: () =>
				readDashboardRows(targetAssignments.map((assignment) => assignment.id)),
			until: (rows) => rows.length === targetAssignments.length,
			timeoutMs: 15_000,
			intervalMs: 250,
		});
		expect(targetRows).toHaveLength(targetAssignments.length);

		// ── ISOLATION: the bystander plan is untouched ──────────────────────
		const bystanderRows = await readDashboardRows(
			bystanderAssignments.map((assignment) => assignment.id),
		);
		expect(bystanderRows).toHaveLength(0);

		const bystanderAfter = await getLicenseDbState({
			db: ctx.db,
			customerId: BYSTANDER_CUSTOMER,
		});
		expect(bystanderAfter.pools[0]?.plan_license_id).toBe(
			catalogPlanLicenseId ?? "",
		);

		// The shared catalog row must be replaced by a custom row, never edited.
		const catalogRowAfter = await ctx.db
			.select()
			.from(planLicenses)
			.where(eq(planLicenses.id, catalogPlanLicenseId ?? ""));
		expect(catalogRowAfter[0]?.is_custom).toBe(false);
		expect(catalogRowAfter[0]?.customized).toBe(
			catalogRowBefore[0]?.customized ?? false,
		);

		const targetAfter = await getLicenseDbState({
			db: ctx.db,
			customerId: TARGET_CUSTOMER,
		});
		expect(targetAfter.pools[0]?.plan_license_id).not.toBe(
			catalogPlanLicenseId ?? "",
		);
	},
);
