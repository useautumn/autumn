/**
 * Distinct live license entitlement defs are page-bounded: only this page's
 * assigned seats, this license product, this feature. Custom ids with the
 * same definition count as their own def; unassigned seats and out-of-scope
 * parents do not.
 *
 * Contract:
 *   - assigned seats surface the catalog entitlement id
 *   - a cloned same-definition id on one assignment is a second distinct def
 *   - unassigned seats and a mismatched parent scope are excluded
 *   - over the cap throws rather than scanning on
 */

import { expect, test } from "bun:test";
import { customerEntitlements, EntInterval } from "@autumn/shared";
import { listDistinctLicenseEntitlementsForPage } from "@/internal/migrations/v2/batchOperations/actions/replaceLicenseEntitlementsForPage/listDistinctLicenseEntitlementsForPage.js";
import { buildOperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import {
	cloneAssignmentEntitlement,
	licenseReplacePageContext,
} from "./utils/licenseReplacePageContext";

const SEAT_MESSAGES = 100;
const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

test.concurrent(
	`${chalk.yellowBright("list-distinct-license-ents: assigned seats surface the catalog id; unassigned and wrong scope do not")}`,
	async () => {
		const customerId = "list-distinct-catalog";
		const idPrefix = "list-distinct-cat";

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
		expect(page.liveAssignments).toHaveLength(ASSIGNED_SEATS);

		const [catalogRow] = await scenario.ctx.db
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
		expect(catalogRow).toBeDefined();

		const { distinct, fromEntitlement } =
			await listDistinctLicenseEntitlementsForPage({
				db: scenario.ctx.db,
				features: scenario.ctx.features,
				internalCustomerIds: [page.internalCustomerId],
				scope: page.scope,
				licensePlanId: page.planLicenseId,
				internalFeatureId: catalogRow!.internal_feature_id,
				fromEntitlementId: catalogRow!.entitlement_id,
			});

		expect(distinct.map((entitlement) => entitlement.id)).toEqual([
			catalogRow!.entitlement_id,
		]);
		expect(fromEntitlement.id).toBe(catalogRow!.entitlement_id);
		expect(distinct[0]?.interval).toBe(EntInterval.Month);
		expect(distinct[0]?.allowance).toBe(SEAT_MESSAGES);

		const { distinct: wrongScope } =
			await listDistinctLicenseEntitlementsForPage({
				db: scenario.ctx.db,
				features: scenario.ctx.features,
				internalCustomerIds: [page.internalCustomerId],
				scope: buildOperationScope({
					internalProductId: "prod_not_this_parent",
				}),
				licensePlanId: page.planLicenseId,
				internalFeatureId: catalogRow!.internal_feature_id,
				fromEntitlementId: catalogRow!.entitlement_id,
			});
		expect(wrongScope).toEqual([]);
	},
);

test.concurrent(
	`${chalk.yellowBright("list-distinct-license-ents: a cloned same-definition id is a second distinct def; over-cap throws")}`,
	async () => {
		const customerId = "list-distinct-custom";
		const idPrefix = "list-distinct-cus";

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
		const cloned = await cloneAssignmentEntitlement({
			db: scenario.ctx.db,
			customerProductId: page.liveAssignments[0]!.id,
			featureId: TestFeature.Messages,
		});

		const [catalogRow] = await scenario.ctx.db
			.select()
			.from(customerEntitlements)
			.where(
				and(
					eq(
						customerEntitlements.customer_product_id,
						page.liveAssignments[1]!.id,
					),
					eq(customerEntitlements.feature_id, TestFeature.Messages),
				),
			);

		const { distinct, fromEntitlement } =
			await listDistinctLicenseEntitlementsForPage({
				db: scenario.ctx.db,
				features: scenario.ctx.features,
				internalCustomerIds: [page.internalCustomerId],
				scope: page.scope,
				licensePlanId: page.planLicenseId,
				internalFeatureId: cloned.internal_feature_id,
				fromEntitlementId: catalogRow!.entitlement_id,
			});

		expect(new Set(distinct.map((entitlement) => entitlement.id)).size).toBe(2);
		expect(distinct.some((entitlement) => entitlement.id === cloned.id)).toBe(
			true,
		);
		expect(fromEntitlement.id).toBe(catalogRow!.entitlement_id);

		await expect(
			listDistinctLicenseEntitlementsForPage({
				db: scenario.ctx.db,
				features: scenario.ctx.features,
				internalCustomerIds: [page.internalCustomerId],
				scope: page.scope,
				licensePlanId: page.planLicenseId,
				internalFeatureId: cloned.internal_feature_id,
				fromEntitlementId: catalogRow!.entitlement_id,
				maxDistinctEntitlements: 1,
			}),
		).rejects.toThrow(/distinct license entitlement definitions/);
	},
);
