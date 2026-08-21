import type { BillingChangeResponse } from "@autumn/shared";
import { expectBillingUpdatedCorrect } from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook";
import {
	type CustomerProductsUpdatedPayload,
	expectProductsUpdatedCorrect,
} from "@tests/integration/billing/autumn-webhooks/utils/expectProductsUpdatedWebhook";
import { expectPreviewBalanceChange } from "@tests/integration/billing/migrations-v2/update-plan-operation/previews/expectMigrationPreviewCorrect";
import type { ScenarioCtx } from "../batch-migrations/batchTestUtils";
import {
	expectMigrationEventBillingPlanChangesEqual,
	expectMigrationItemEventCorrect,
	type MigrationItemEvents,
} from "./expectMigrationItemEvent";

type ItemChangeExpectation = {
	action: "created" | "deleted";
	featureId: string;
	included?: number;
};

type BalanceExpectation = {
	featureId: string;
	granted: number;
	remaining: number;
	usage: number;
	previousGranted: number;
	previousRemaining: number;
};

/** One customer's filter-mode stamp: live from-definition on item_changes
 * and billing.updated, plus remaining after the grant delta when replacing. */
export const expectFilterLiveDefinitionCorrect = async ({
	ctx,
	events,
	billingUpdated,
	productsUpdated,
	customerId,
	planId,
	itemChanges,
	balance,
	absentFeatureIds,
	flagChanges,
}: {
	ctx: ScenarioCtx;
	events: MigrationItemEvents | null;
	billingUpdated: BillingChangeResponse | null;
	productsUpdated?: CustomerProductsUpdatedPayload["data"] | null;
	customerId: string;
	planId: string;
	itemChanges: ItemChangeExpectation[];
	balance?: BalanceExpectation;
	absentFeatureIds?: string[];
	flagChanges?: { action: "created" | "deleted"; featureId: string }[];
}) => {
	expectBillingUpdatedCorrect({
		data: billingUpdated,
		customerId,
		entityId: null,
		planChanges: [{ planId, itemChanges }],
	});

	if (productsUpdated !== undefined) {
		expectProductsUpdatedCorrect({
			data: productsUpdated,
			customerId,
			planId,
			entityId: null,
			...(absentFeatureIds
				? { absentFeatureIds }
				: balance
					? {
							features: [
								{
									featureId: balance.featureId,
									balance: balance.remaining,
								},
							],
						}
					: {}),
		});
	}

	if (!events) return;

	await expectMigrationItemEventCorrect({
		ctx,
		events,
		customerId,
		status: "succeeded",
		planChangeActions: ["updated"],
		planChangePlanIds: [planId],
		itemChanges,
		balanceFeatureIds: balance ? [balance.featureId] : [],
		...(flagChanges ? { flagChanges } : {}),
	});

	const preview = await expectMigrationEventBillingPlanChangesEqual({
		ctx,
		events,
		customerId,
		billingUpdated,
	});

	if (!balance) return;

	expectPreviewBalanceChange({
		preview,
		featureId: balance.featureId,
		balance: {
			granted: balance.granted,
			remaining: balance.remaining,
			usage: balance.usage,
			unlimited: false,
		},
		previousAttributes: {
			granted: balance.previousGranted,
			remaining: balance.previousRemaining,
		},
	});
};
