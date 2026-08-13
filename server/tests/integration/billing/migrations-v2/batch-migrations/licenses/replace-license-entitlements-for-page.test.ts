/**
 * replaceLicenseEntitlementsForPage expands live ids via entsAreSame, credits
 * the allowance delta, and always writes cycle fields (enrich ladder or null).
 *
 * Contract:
 *   - monthly 100 → 200 credits the delta; a cloned same-definition id also moves
 *   - lifetime → monthly sets reset_cycle_anchor / next_reset_at from the parent
 *   - monthly → lifetime nulls cycle fields; a replay matches zero rows
 */

import { expect, test } from "bun:test";
import {
	AllowanceType,
	customerEntitlements,
	EntInterval,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { computeCustomerEntitlementInitialState } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";
import { replaceLicenseEntitlementsForPage } from "@/internal/migrations/v2/batchOperations/actions/replaceLicenseEntitlementsForPage/replaceLicenseEntitlementsForPage.js";
import { expectAssignmentEntitlementCyclesMatchStripe } from "@tests/integration/licenses/billing/transitions/utils/expectAssignmentEntitlementCyclesMatchStripe";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import {
	cloneAssignmentEntitlement,
	licenseReplacePageContext,
	loadEntitlementWithFeature,
	mintEntitlement,
} from "./utils/licenseReplacePageContext";

const SEAT_MESSAGES = 100;
const NEW_SEAT_MESSAGES = 200;
const CONSUMED = 40;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;
const SEAT_PRICE = 20;

const messageRows = async ({
	db,
	assignmentIds,
}: {
	db: DrizzleCli;
	assignmentIds: string[];
}) =>
	db
		.select({
			entitlementId: customerEntitlements.entitlement_id,
			balance: customerEntitlements.balance,
			resetCycleAnchor: customerEntitlements.reset_cycle_anchor,
			nextResetAt: customerEntitlements.next_reset_at,
		})
		.from(customerEntitlements)
		.where(
			and(
				inArray(customerEntitlements.customer_product_id, assignmentIds),
				eq(customerEntitlements.feature_id, TestFeature.Messages),
			),
		);

test.concurrent(
	`${chalk.yellowBright("replace-license-ents: same-interval allowance edit credits the delta and moves a cloned id")}`,
	async () => {
		const customerId = "replace-lic-allowance";
		const idPrefix = "repl-lic-allw";

		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});
		await scenario.assignSeats({ count: ASSIGNED_SEATS });

		const page = await licenseReplacePageContext({
			db: scenario.ctx.db,
			customerId,
		});
		const [live] = await scenario.ctx.db
			.select()
			.from(customerEntitlements)
			.where(
				and(
					eq(
						customerEntitlements.customer_product_id,
						page.liveAssignments[0]!.id,
					),
					eq(customerEntitlements.feature_id, TestFeature.Messages),
				),
			);
		expect(live).toBeDefined();

		await scenario.ctx.db
			.update(customerEntitlements)
			.set({ balance: SEAT_MESSAGES - CONSUMED })
			.where(eq(customerEntitlements.id, live!.id));

		const cloned = await cloneAssignmentEntitlement({
			db: scenario.ctx.db,
			customerProductId: page.liveAssignments[1]!.id,
			featureId: TestFeature.Messages,
		});
		const fromEntitlement = await loadEntitlementWithFeature({
			db: scenario.ctx.db,
			id: live!.entitlement_id,
		});
		const toEntitlement = await mintEntitlement({
			db: scenario.ctx.db,
			from: fromEntitlement,
			overrides: { allowance: NEW_SEAT_MESSAGES },
		});

		const result = await replaceLicenseEntitlementsForPage({
			db: scenario.ctx.db,
			features: scenario.ctx.features,
			scope: page.scope,
			internalCustomerIds: [page.internalCustomerId],
			replace: {
				kind: "replace",
				fromEntitlementId: fromEntitlement.id,
				entitlement: toEntitlement,
				initialState: computeCustomerEntitlementInitialState({
					entitlement: toEntitlement,
				}),
				licensePlanId: scenario.devSeat.id,
				planLicenseId: page.planLicenseId!,
				licenseInternalProductId: page.licenseInternalProductId,
				isOneOff: false,
			},
			now: Date.now(),
		});

		expect(result.affected).toBe(ASSIGNED_SEATS);
		expect(result.distinctEntitlements).toBe(2);
		expect(result.insertedItems).toHaveLength(ASSIGNED_SEATS);
		expect(
			result.insertedItems.every(
				(item) =>
					item.featureId === TestFeature.Messages &&
					item.granted === NEW_SEAT_MESSAGES &&
					item.nextResetAt != null,
			),
		).toBe(true);

		const rows = await messageRows({
			db: scenario.ctx.db,
			assignmentIds: page.liveAssignments.map((assignment) => assignment.id),
		});
		expect(rows).toHaveLength(ASSIGNED_SEATS);
		expect(rows.every((row) => row.entitlementId === toEntitlement.id)).toBe(
			true,
		);
		expect(
			rows.map((row) => row.balance).sort((a, b) => (a ?? 0) - (b ?? 0)),
		).toEqual([NEW_SEAT_MESSAGES - CONSUMED, NEW_SEAT_MESSAGES]);
		expect(cloned.id).not.toBe(fromEntitlement.id);

		const replay = await replaceLicenseEntitlementsForPage({
			db: scenario.ctx.db,
			features: scenario.ctx.features,
			scope: page.scope,
			internalCustomerIds: [page.internalCustomerId],
			replace: {
				kind: "replace",
				fromEntitlementId: fromEntitlement.id,
				entitlement: toEntitlement,
				initialState: computeCustomerEntitlementInitialState({
					entitlement: toEntitlement,
				}),
				licensePlanId: scenario.devSeat.id,
				planLicenseId: page.planLicenseId!,
				licenseInternalProductId: page.licenseInternalProductId,
				isOneOff: false,
			},
			now: Date.now(),
		});
		expect(replay.affected).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("replace-license-ents: lifetime → monthly re-anchors off the parent Stripe cycle")}`,
	async () => {
		const customerId = "replace-lic-lt-mo";
		const idPrefix = "repl-lic-ltmo";

		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatPrice: SEAT_PRICE,
			seatItems: [items.lifetimeMessages({ includedUsage: SEAT_MESSAGES })],
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
			testClock: true,
		});
		await scenario.assignSeats({ count: ASSIGNED_SEATS });

		const page = await licenseReplacePageContext({
			db: scenario.ctx.db,
			customerId,
		});
		const [live] = await scenario.ctx.db
			.select()
			.from(customerEntitlements)
			.where(
				and(
					eq(
						customerEntitlements.customer_product_id,
						page.liveAssignments[0]!.id,
					),
					eq(customerEntitlements.feature_id, TestFeature.Messages),
				),
			);
		const fromEntitlement = await loadEntitlementWithFeature({
			db: scenario.ctx.db,
			id: live!.entitlement_id,
		});
		const toEntitlement = await mintEntitlement({
			db: scenario.ctx.db,
			from: fromEntitlement,
			overrides: {
				allowance: NEW_SEAT_MESSAGES,
				allowance_type: AllowanceType.Fixed,
				interval: EntInterval.Month,
				interval_count: 1,
			},
		});

		await replaceLicenseEntitlementsForPage({
			db: scenario.ctx.db,
			features: scenario.ctx.features,
			scope: page.scope,
			internalCustomerIds: [page.internalCustomerId],
			replace: {
				kind: "replace",
				fromEntitlementId: fromEntitlement.id,
				entitlement: toEntitlement,
				initialState: computeCustomerEntitlementInitialState({
					entitlement: toEntitlement,
				}),
				licensePlanId: scenario.devSeat.id,
				planLicenseId: page.planLicenseId!,
				licenseInternalProductId: page.licenseInternalProductId,
				isOneOff: false,
			},
			now: Date.now(),
		});

		const rows = await messageRows({
			db: scenario.ctx.db,
			assignmentIds: page.liveAssignments.map((assignment) => assignment.id),
		});
		expect(rows).toHaveLength(ASSIGNED_SEATS);
		expect(rows.every((row) => row.entitlementId === toEntitlement.id)).toBe(
			true,
		);
		expect(rows.every((row) => row.balance === NEW_SEAT_MESSAGES)).toBe(true);

		await expectAssignmentEntitlementCyclesMatchStripe({
			ctx: scenario.ctx,
			customerId,
			assignmentIds: page.liveAssignments.map((assignment) => assignment.id),
			featureId: TestFeature.Messages,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("replace-license-ents: monthly → lifetime nulls cycle fields")}`,
	async () => {
		const customerId = "replace-lic-mo-lt";
		const idPrefix = "repl-lic-molt";

		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix,
			seatItems: [items.monthlyMessages({ includedUsage: SEAT_MESSAGES })],
			includedSeats: INCLUDED_SEATS,
			attachedSeats: ATTACHED_SEATS,
		});
		await scenario.assignSeats({ count: ASSIGNED_SEATS });

		const page = await licenseReplacePageContext({
			db: scenario.ctx.db,
			customerId,
		});
		const [live] = await scenario.ctx.db
			.select()
			.from(customerEntitlements)
			.where(
				and(
					eq(
						customerEntitlements.customer_product_id,
						page.liveAssignments[0]!.id,
					),
					eq(customerEntitlements.feature_id, TestFeature.Messages),
				),
			);
		expect(live?.next_reset_at).not.toBeNull();

		const fromEntitlement = await loadEntitlementWithFeature({
			db: scenario.ctx.db,
			id: live!.entitlement_id,
		});
		const toEntitlement = await mintEntitlement({
			db: scenario.ctx.db,
			from: fromEntitlement,
			overrides: {
				allowance: NEW_SEAT_MESSAGES,
				interval: EntInterval.Lifetime,
				interval_count: 1,
			},
		});

		await replaceLicenseEntitlementsForPage({
			db: scenario.ctx.db,
			features: scenario.ctx.features,
			scope: page.scope,
			internalCustomerIds: [page.internalCustomerId],
			replace: {
				kind: "replace",
				fromEntitlementId: fromEntitlement.id,
				entitlement: toEntitlement,
				initialState: computeCustomerEntitlementInitialState({
					entitlement: toEntitlement,
				}),
				licensePlanId: scenario.devSeat.id,
				planLicenseId: page.planLicenseId!,
				licenseInternalProductId: page.licenseInternalProductId,
				isOneOff: false,
			},
			now: Date.now(),
		});

		const rows = await messageRows({
			db: scenario.ctx.db,
			assignmentIds: page.liveAssignments.map((assignment) => assignment.id),
		});
		expect(rows).toHaveLength(ASSIGNED_SEATS);
		expect(rows.every((row) => row.entitlementId === toEntitlement.id)).toBe(
			true,
		);
		expect(rows.every((row) => row.resetCycleAnchor === null)).toBe(true);
		expect(rows.every((row) => row.nextResetAt === null)).toBe(true);
	},
);
