import type { ProductItem } from "@autumn/shared";
import { customerEntitlements, entitlements } from "@autumn/shared";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { buildScenarioOperations } from "@tests/perf/batch-migrations/scenarios/buildScenarioOperations";
import type {
	ItemSpec,
	MigrationScenario,
} from "@tests/perf/batch-migrations/scenarios/migrationScenarioTypes";
import { eq, inArray } from "drizzle-orm";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";

const INCLUDED_SEATS = 1;
const ATTACHED_SEATS = 3;
const ASSIGNED_SEATS = 2;

const toProductItem = (item: ItemSpec): ProductItem => {
	if (item.priced) {
		return constructPrepaidItem({
			featureId: item.featureId,
			price: item.priced.amount,
			billingUnits: item.priced.billingUnits,
			includedUsage: item.included ?? 0,
		}) as ProductItem;
	}
	return constructFeatureItem({
		featureId: item.featureId,
		includedUsage: item.included,
		isBoolean: item.boolean,
		interval: item.interval as never,
		entityFeatureId: item.entityFeatureId,
		rolloverConfig: item.rollover
			? { max: item.rollover.max, length: 1 }
			: undefined,
	} as never) as ProductItem;
};

export type ScenarioRunOutcome = {
	lane: string | undefined;
	rowsByFeature: Record<string, number>;
	balanceByFeature: Record<string, number>;
	entitlementIdByFeature: Record<string, string>;
};

/** Seeds a scenario through the real API, runs its migration, and reads back the
 * state the expectation is written against. */
export const runMigrationScenario = async ({
	scenario,
	idPrefix,
}: {
	scenario: MigrationScenario;
	idPrefix: string;
}): Promise<ScenarioRunOutcome> => {
	const customerId = `${idPrefix}-customer`;
	const targetsLicense = scenario.op.target === "license";

	const setup = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		parentItems: scenario.planItems.map(toProductItem),
		seatItems: (scenario.licenseItems ?? []).map(toProductItem),
		includedSeats: INCLUDED_SEATS,
		attachedSeats: ATTACHED_SEATS,
	});
	if (targetsLicense) await setup.assignSeats({ count: ASSIGNED_SEATS });

	const { ctx, autumnV2_2, parent, devSeat } = setup;

	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${idPrefix}-mig`,
		filter: { customer: { plan: { plan_id: parent.id, custom: false } } },
		operations: buildScenarioOperations({
			scenario,
			planId: parent.id,
			licensePlanId: devSeat.id,
		}),
		noBillingChanges: true,
	});

	const { assignments, products } = await getLicenseDbState({
		db: ctx.db,
		customerId,
	});
	// A license op writes to the seat assignments; a plan op writes to the
	// customer product for the plan itself, which carries no link id.
	const targetIds = targetsLicense
		? assignments
				.filter((assignment) => assignment.internal_entity_id)
				.map((assignment) => assignment.id)
		: products
				.filter((product) => !product.customer_license_link_id)
				.map((product) => product.id);

	const rows =
		targetIds.length === 0
			? []
			: await ctx.db
					.select({
						featureId: customerEntitlements.feature_id,
						balance: customerEntitlements.balance,
						entitlementId: customerEntitlements.entitlement_id,
					})
					.from(customerEntitlements)
					.where(inArray(customerEntitlements.customer_product_id, targetIds));

	const perTarget = Math.max(targetIds.length, 1);
	const rowsByFeature: Record<string, number> = {};
	const balanceByFeature: Record<string, number> = {};
	const entitlementIdByFeature: Record<string, string> = {};
	for (const row of rows) {
		const featureId = row.featureId;
		if (!featureId) continue;
		rowsByFeature[featureId] = (rowsByFeature[featureId] ?? 0) + 1;
		balanceByFeature[featureId] = row.balance;
		entitlementIdByFeature[featureId] = row.entitlementId;
	}
	for (const featureId of Object.keys(rowsByFeature)) {
		rowsByFeature[featureId] = rowsByFeature[featureId] / perTarget;
	}

	return {
		lane: result?.lane,
		rowsByFeature,
		balanceByFeature,
		entitlementIdByFeature,
	};
};
