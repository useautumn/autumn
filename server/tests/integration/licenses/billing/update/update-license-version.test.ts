/**
 * TDD contract: version changes on license-backed plans ride the
 * EXPIRE+INSERT path — a new customer product row replaces the old one, and
 * the replanted pool ADOPTS the outgoing link + counters (transitions), so
 * seats never strand.
 *
 * Contract under test:
 *   Behaviors:
 *     - version bump + upsert_licenses (no assignments): new parent row,
 *       pool carries paid_quantity + link, definition is_custom at the new
 *       price, invoice delta = paid x price delta, Stripe correct
 *     - version bump only (no assignments): new parent row, pool carries
 *       paid_quantity + link on the catalog definition, no billing delta
 *     - version bump only WITH assignments: seats RELINK — same link_id,
 *       assignments anchor to the new active parent's pool, usage carried
 *   Side effects:
 *     - old parent row expired; pool's parent_customer_product_id moves;
 *       pool link_id is stable across the transition
 */
import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { BillingInterval } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { expectAssignmentsAnchoredToParent } from "@tests/integration/licenses/utils/expectAssignmentsAnchoredToParent";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseUpdatePreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";

const CATALOG_SEAT_PRICE = 20;
const CUSTOM_SEAT_PRICE = 30;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const PAID_SEATS = ATTACHED_SEATS - INCLUDED_SEATS;

const setupVersionedScenario = async ({
	customerId,
	idPrefix,
}: {
	customerId: string;
	idPrefix: string;
}) => {
	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatPrice: CATALOG_SEAT_PRICE,
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});

	// Mint parent v2 (item change) without touching the customer.
	await scenario.autumnV2_3.post("/plans.update", {
		plan_id: scenario.parent.id,
		items: [itemsV2.monthlyWords({ included: 100 })],
		force_version: true,
	});

	const { pools } = await getLicenseDbState({
		db: scenario.ctx.db,
		customerId,
	});
	return { scenario, poolsBefore: pools };
};

const expectPoolReplantedCorrect = async ({
	scenario,
	customerId,
	poolsBefore,
	isCustom,
	seatPrice,
	usage = 0,
}: {
	scenario: Awaited<ReturnType<typeof setupVersionedScenario>>["scenario"];
	customerId: string;
	poolsBefore: Awaited<ReturnType<typeof getLicenseDbState>>["pools"];
	isCustom: boolean;
	seatPrice: number;
	usage?: number;
}) => {
	const { ctx, autumnV2_3, parent, devSeat } = scenario;

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: devSeat.id,
				parent_plan_id: parent.id,
				granted: ATTACHED_SEATS,
				usage,
				remaining: ATTACHED_SEATS - usage,
				paid_quantity: PAID_SEATS,
			},
		],
	});

	const pool = await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		isCustom,
		basePrice: { amount: seatPrice, interval: BillingInterval.Month },
	});

	// ── Expire+insert: NEW parent row, SAME adopted link ────────────────
	expect(poolsBefore).toHaveLength(1);
	expect(pool.parent_customer_product_id).not.toBe(
		poolsBefore[0].parent_customer_product_id,
	);
	expect(pool.link_id).toBe(poolsBefore[0].link_id);

	await expectStripeSubscriptionCorrect({ ctx, customerId });
};

// ═══════════════════════════════════════════════════════════════════════════
// CASE 1: version + upsert_licenses (no assignments)
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("license-update-version: version + upsert replants pool on custom def")}`,
	async () => {
		const customerId = "license-update-version-upsert";
		const { scenario, poolsBefore } = await setupVersionedScenario({
			customerId,
			idPrefix: "lic-ver-upsert",
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: scenario.parent.id,
			version: 2,
			customize: {
				upsert_licenses: [
					{
						license_plan_id: scenario.devSeat.id,
						customize: {
							price: {
								amount: CUSTOM_SEAT_PRICE,
								interval: BillingInterval.Month,
							},
						},
					},
				],
			},
		};
		const preview =
			await scenario.autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo: scenario.advancedTo,
			oldRecurringTotal: PAID_SEATS * CATALOG_SEAT_PRICE,
			newRecurringTotal: PAID_SEATS * CUSTOM_SEAT_PRICE,
		});

		await scenario.autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		await expectPoolReplantedCorrect({
			scenario,
			customerId,
			poolsBefore,
			isCustom: true,
			seatPrice: CUSTOM_SEAT_PRICE,
		});

		const customerV3 =
			await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: PAID_SEATS * (CUSTOM_SEAT_PRICE - CATALOG_SEAT_PRICE),
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// CASE 2: version only (no assignments) — paid seats carry, no billing delta
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("license-update-version: version-only carries paid seats, no delta")}`,
	async () => {
		const customerId = "license-update-version-only";
		const { scenario, poolsBefore } = await setupVersionedScenario({
			customerId,
			idPrefix: "lic-ver-only",
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: scenario.parent.id,
			version: 2,
		};
		const preview =
			await scenario.autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				updateParams,
			);
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo: scenario.advancedTo,
			oldRecurringTotal: PAID_SEATS * CATALOG_SEAT_PRICE,
			newRecurringTotal: PAID_SEATS * CATALOG_SEAT_PRICE,
		});

		await scenario.autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		await expectPoolReplantedCorrect({
			scenario,
			customerId,
			poolsBefore,
			isCustom: false,
			seatPrice: CATALOG_SEAT_PRICE,
		});

		// Same seat price both sides — proration nets to zero, no new invoice.
		const customerV3 =
			await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({ customer: customerV3, count: 1 });
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// CASE 3: version only WITH assignments — seats relink via link adoption
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("license-update-version: assigned seats relink onto the new parent's pool")}`,
	async () => {
		const customerId = "license-update-version-assigned";
		const { scenario, poolsBefore } = await setupVersionedScenario({
			customerId,
			idPrefix: "lic-ver-assigned",
		});

		await scenario.autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: scenario.devSeat.id,
			entities: [
				{
					entity_id: "lic-ver-assigned-entity",
					name: "Seat 1",
					feature_id: TestFeature.Users,
				},
			],
		});

		await scenario.autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: scenario.parent.id,
			version: 2,
		});

		await expectPoolReplantedCorrect({
			scenario,
			customerId,
			poolsBefore,
			isCustom: false,
			seatPrice: CATALOG_SEAT_PRICE,
			usage: 1,
		});

		// ── Seats anchor to the NEW active parent through the carried link ──
		await expectAssignmentsAnchoredToParent({
			ctx: scenario.ctx,
			customerId,
			parentPlanId: scenario.parent.id,
			count: 1,
		});
	},
);
