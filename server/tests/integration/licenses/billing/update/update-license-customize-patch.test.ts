/**
 * TDD contract: customize.upsert_licenses on billing.update rides the PATCH
 * path — same customer product row, same pool row, same link; seats never
 * repoint their anchor and re-price uniformly onto the new definition.
 *
 * Contract under test (per case: upsert only / base price + upsert /
 * add+remove items + upsert):
 *   Behaviors:
 *     - pool converges in place: SAME pool row id + link_id + parent row
 *     - pool anchors an is_custom definition with the custom base price
 *     - counters untouched by definition change: granted 3, paid 2, usage 2
 *     - seats stay anchored: assignments -> pool -> ACTIVE parent
 *     - seat re-price is UNIFORM: every live assignment's fixed price row
 *       carries the new amount                    [RED: seat-half executor]
 *     - invoice delta = paid_quantity x price delta (+ any parent delta)
 *                                                  [RED: seat AFTER-projection]
 *     - Stripe sub state matches Autumn-derived expected state
 *     - entity seat balances untouched (messages granted/remaining 500)
 *   Side effects:
 *     - is_custom plan_license row + pool.plan_license_id repoint (DB)
 *
 * Pre-impl red: seat-price and full-invoice-delta assertions fail — the seat
 * half of the repoint (bulk customer_prices repoint + charge-side
 * re-projection) has no executor yet. Everything else is green.
 */
import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	ApiEntityV2,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { BillingInterval, customerEntitlements } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { expectAssignmentPricesCorrect } from "@tests/integration/licenses/utils/expectAssignmentPricesCorrect";
import { expectAssignmentsAnchoredToParent } from "@tests/integration/licenses/utils/expectAssignmentsAnchoredToParent";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseUpdatePreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { inArray } from "drizzle-orm";

const CATALOG_SEAT_PRICE = 20;
const CUSTOM_SEAT_PRICE = 40;
const SEAT_MESSAGES = 500;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const PAID_SEATS = ATTACHED_SEATS - INCLUDED_SEATS;
const ASSIGNED_SEATS = 2;
const SEAT_PRICE_DELTA = CUSTOM_SEAT_PRICE - CATALOG_SEAT_PRICE;

const upsertSeatPrice = ({ licensePlanId }: { licensePlanId: string }) => [
	{
		license_plan_id: licensePlanId,
		customize: {
			price: { amount: CUSTOM_SEAT_PRICE, interval: BillingInterval.Month },
		},
	},
];

type Scenario = Awaited<ReturnType<typeof setupLicenseUpdateScenario>>;

/** The full patch-path contract, shared by every case in this file. */
const expectPatchedLicenseStateCorrect = async ({
	scenario,
	customerId,
	poolsBefore,
	extraInvoiceDelta = 0,
}: {
	scenario: Scenario;
	customerId: string;
	poolsBefore: Awaited<ReturnType<typeof getLicenseDbState>>["pools"];
	extraInvoiceDelta?: number;
}) => {
	const { ctx, autumnV1, autumnV2_3, parent, devSeat } = scenario;

	// ── Pool counters untouched; definition swapped ────────────────────
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

	// ── DB: is_custom definition at the custom price ───────────────────
	const pool = await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		isCustom: true,
		basePrice: { amount: CUSTOM_SEAT_PRICE, interval: BillingInterval.Month },
	});

	// ── DB: SAME pool row, link, and parent row (in-place patch) ───────
	expect(poolsBefore).toHaveLength(1);
	expect(pool.id).toBe(poolsBefore[0].id);
	expect(pool.link_id).toBe(poolsBefore[0].link_id);
	expect(pool.parent_customer_product_id).toBe(
		poolsBefore[0].parent_customer_product_id,
	);

	// ── DB: seats still anchor to the live parent's pool ───────────────
	await expectAssignmentsAnchoredToParent({
		ctx,
		customerId,
		parentPlanId: parent.id,
		count: ASSIGNED_SEATS,
	});

	// ── DB: uniform seat re-price [RED until seat-half executor] ───────
	await expectAssignmentPricesCorrect({
		ctx,
		customerId,
		amount: CUSTOM_SEAT_PRICE,
		count: ASSIGNED_SEATS,
	});

	// ── Invoice: paid seats re-price in full [RED until AFTER-projection]
	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerV3,
		count: 2,
		latestTotal: PAID_SEATS * SEAT_PRICE_DELTA + extraInvoiceDelta,
	});

	// ── Stripe: sub matches Autumn-derived state ───────────────────────
	await expectStripeSubscriptionCorrect({ ctx, customerId });

	// ── Entity seat balances untouched ─────────────────────────────────
	for (let index = 1; index <= ASSIGNED_SEATS; index++) {
		const apiEntity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			`${scenario.idPrefix}-entity-${index}`,
		);
		expectBalanceCorrect({
			customer: apiEntity,
			featureId: TestFeature.Messages,
			planId: devSeat.id,
			granted: SEAT_MESSAGES,
			remaining: SEAT_MESSAGES,
			usage: 0,
		});
	}
};

const setupAssignedScenario = async ({
	customerId,
	idPrefix,
	parentItems,
}: {
	customerId: string;
	idPrefix: string;
	parentItems?: Parameters<typeof setupLicenseUpdateScenario>[0]["parentItems"];
}) => {
	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		parentItems,
		seatPrice: CATALOG_SEAT_PRICE,
		seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	await scenario.assignSeats({ count: ASSIGNED_SEATS });
	const { pools } = await getLicenseDbState({
		db: scenario.ctx.db,
		customerId,
	});
	return { scenario, poolsBefore: pools };
};

// ═══════════════════════════════════════════════════════════════════════════
// CASE 1: upsert_licenses only
// ═══════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("license-update-patch: upsert only re-prices pool + seats in place")}`,
	async () => {
		const customerId = "license-update-patch-upsert";
		const { scenario, poolsBefore } = await setupAssignedScenario({
			customerId,
			idPrefix: "lic-patch-upsert",
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: scenario.parent.id,
			customize: {
				upsert_licenses: upsertSeatPrice({
					licensePlanId: scenario.devSeat.id,
				}),
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

		await expectPatchedLicenseStateCorrect({
			scenario,
			customerId,
			poolsBefore,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// CASE 2: base price patch + upsert_licenses
// ═══════════════════════════════════════════════════════════════════════════

const BASE_PRICE = 50;
const UPDATED_BASE_PRICE = 60;

test.concurrent(
	`${chalk.yellowBright("license-update-patch: base price + upsert patch together")}`,
	async () => {
		const customerId = "license-update-patch-price";
		const { scenario, poolsBefore } = await setupAssignedScenario({
			customerId,
			idPrefix: "lic-patch-price",
			parentItems: [
				items.monthlyPrice({ price: BASE_PRICE }),
				items.dashboard(),
			],
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: scenario.parent.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: UPDATED_BASE_PRICE }),
				upsert_licenses: upsertSeatPrice({
					licensePlanId: scenario.devSeat.id,
				}),
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
			oldRecurringTotal: BASE_PRICE + PAID_SEATS * CATALOG_SEAT_PRICE,
			newRecurringTotal: UPDATED_BASE_PRICE + PAID_SEATS * CUSTOM_SEAT_PRICE,
		});

		await scenario.autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		await expectPatchedLicenseStateCorrect({
			scenario,
			customerId,
			poolsBefore,
			extraInvoiceDelta: UPDATED_BASE_PRICE - BASE_PRICE,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// CASE 3: add_items / remove_items + upsert_licenses
// ═══════════════════════════════════════════════════════════════════════════

const PARENT_WORDS = 100;
const PARENT_CREDITS = 50;

test.concurrent(
	`${chalk.yellowBright("license-update-patch: item add/remove + upsert patch together")}`,
	async () => {
		const customerId = "license-update-patch-items";
		const { scenario, poolsBefore } = await setupAssignedScenario({
			customerId,
			idPrefix: "lic-patch-items",
			parentItems: [
				items.dashboard(),
				items.monthlyWords({ includedUsage: PARENT_WORDS }),
			],
		});

		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: scenario.parent.id,
			customize: {
				remove_items: [{ feature_id: TestFeature.Words }],
				add_items: [itemsV2.monthlyCredits({ included: PARENT_CREDITS })],
				upsert_licenses: upsertSeatPrice({
					licensePlanId: scenario.devSeat.id,
				}),
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

		await expectPatchedLicenseStateCorrect({
			scenario,
			customerId,
			poolsBefore,
		});

		// ── Parent item swap landed alongside the license patch ─────────
		const customer =
			await scenario.autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Credits,
			granted: PARENT_CREDITS,
			remaining: PARENT_CREDITS,
			usage: 0,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// CASE 4: entitlement repoint — planItem transitions via feature + interval
// ═══════════════════════════════════════════════════════════════════════════

const CUSTOM_SEAT_MESSAGES = 1000;

test.concurrent(
	`${chalk.yellowBright("license-update-patch: seat entitlements repoint onto the custom definition")}`,
	async () => {
		const customerId = "license-update-patch-ents";
		const { scenario } = await setupAssignedScenario({
			customerId,
			idPrefix: "lic-patch-ents",
		});

		// Same price, bigger messages grant: entitlement-only transition.
		const updateParams: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: scenario.parent.id,
			customize: {
				upsert_licenses: [
					{
						license_plan_id: scenario.devSeat.id,
						customize: {
							remove_items: [{ feature_id: TestFeature.Messages }],
							add_items: [
								itemsV2.monthlyMessages({ included: CUSTOM_SEAT_MESSAGES }),
							],
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
			newRecurringTotal: PAID_SEATS * CATALOG_SEAT_PRICE,
		});

		await scenario.autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>(
			updateParams,
		);

		// ── DB: definition repointed; seat cusEnt refs converge inline ──
		const pool = await expectLicenseDefinitionCorrect({
			ctx: scenario.ctx,
			customerId,
			parentPlanId: scenario.parent.id,
			isCustom: true,
		});
		const customMessagesEntitlement =
			pool.planLicense?.product.entitlements.find(
				(entitlement) => entitlement.feature?.id === TestFeature.Messages,
			);
		expect(customMessagesEntitlement).toBeDefined();

		const { assignments } = await getLicenseDbState({
			db: scenario.ctx.db,
			customerId,
		});
		const liveAssignments = assignments.filter(
			(assignment) => assignment.internal_entity_id,
		);
		expect(liveAssignments).toHaveLength(ASSIGNED_SEATS);

		const readSeatMessageRows = async () => {
			const rows = await scenario.ctx.db
				.select({
					entitlementId: customerEntitlements.entitlement_id,
					featureId: customerEntitlements.internal_feature_id,
				})
				.from(customerEntitlements)
				.where(
					inArray(
						customerEntitlements.customer_product_id,
						liveAssignments.map((assignment) => assignment.id),
					),
				);
			return rows.filter(
				(row) =>
					row.featureId === customMessagesEntitlement?.internal_feature_id,
			);
		};

		// Without a trigger secret the repoint runs inline, so seat refs are
		// already converged onto the custom definition after the update.
		const convergedRows = await readSeatMessageRows();
		expect(convergedRows).toHaveLength(ASSIGNED_SEATS);
		for (const row of convergedRows) {
			expect(row.entitlementId).toBe(customMessagesEntitlement?.id ?? "");
		}

		// Balance carry semantics on allowance changes are deliberately NOT
		// asserted — refs repoint only; balances stay untouched for now.
	},
);
