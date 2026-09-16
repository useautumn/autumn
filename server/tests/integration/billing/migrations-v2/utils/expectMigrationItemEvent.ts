import { expect } from "bun:test";
import type { BillingChangeResponse, CustomerPlanChange } from "@autumn/shared";
import type { TinybirdMigrationItemEvent } from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";
import type { PreviewMigrateCustomer } from "@/internal/migrations/v2/preview/previewMigrateCustomer/types/index.js";
import { migrationItemEventRepo } from "@/internal/migrations/v2/repos/index.js";
import {
	getInternalCustomerId,
	type ScenarioCtx,
} from "../batch-migrations/batchTestUtils";

export type MigrationItemEvents = TinybirdMigrationItemEvent[];

const INGEST_POLL_ATTEMPTS = 15;
const INGEST_POLL_INTERVAL_MS = 2000;

/** Tinybird ingest is async (`wait: false`), so read back with polling rather
 * than once. Returns null when Tinybird isn't configured — callers skip their
 * assertions, but an empty read while configured stays a failure. */
export const getMigrationItemEvents = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	expectedCount,
}: {
	ctx: ScenarioCtx;
	migrationInternalId: string;
	migrationRunId: string;
	expectedCount: number;
}): Promise<MigrationItemEvents | null> => {
	if (!process.env.TINYBIRD_US_EAST_TOKEN) return null;

	let events: MigrationItemEvents = [];
	for (let attempt = 0; attempt < INGEST_POLL_ATTEMPTS; attempt++) {
		if (attempt > 0) {
			await new Promise((resolve) =>
				setTimeout(resolve, INGEST_POLL_INTERVAL_MS),
			);
		}
		events = await migrationItemEventRepo.listLatest({
			ctx,
			migrationInternalId,
			migrationRunId,
			dryRun: false,
		});
		if (events.length >= expectedCount) break;
	}

	expect(events.length).toBeGreaterThanOrEqual(expectedCount);
	return events;
};

type EventResponse = {
	lane?: string;
	reason?: string;
	preview?: PreviewMigrateCustomer | null;
};

const findMigrationItemEventResponse = async ({
	ctx,
	events,
	customerId,
}: {
	ctx: ScenarioCtx;
	events: MigrationItemEvents;
	customerId: string;
}): Promise<EventResponse | null> => {
	const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
	const event = events.find(
		(candidate) => candidate.item_id === internalCustomerId,
	);
	expect(event, `Missing item event for ${customerId}`).toBeDefined();
	return (event?.response as EventResponse | null) ?? null;
};

export const getMigrationItemEventPreview = async ({
	ctx,
	events,
	customerId,
}: {
	ctx: ScenarioCtx;
	events: MigrationItemEvents;
	customerId: string;
}): Promise<PreviewMigrateCustomer> => {
	const response = await findMigrationItemEventResponse({
		ctx,
		events,
		customerId,
	});
	expect(response?.preview).toBeDefined();
	if (!response?.preview) {
		throw new Error(`Expected a migration preview for ${customerId}`);
	}
	return response.preview;
};

export const expectMigrationEventBillingPlanChangesEqual = async ({
	ctx,
	events,
	customerId,
	billingUpdated,
}: {
	ctx: ScenarioCtx;
	events: MigrationItemEvents;
	customerId: string;
	billingUpdated: BillingChangeResponse | null;
}): Promise<PreviewMigrateCustomer> => {
	const preview = await getMigrationItemEventPreview({
		ctx,
		events,
		customerId,
	});
	expect(billingUpdated?.plan_changes).toEqual(preview.plan_changes);
	return preview;
};

/**
 * Asserts one customer's audit event. Only the fields you pass are checked,
 * mirroring `expectBalanceCorrect`'s style.
 */
export const expectMigrationItemEventCorrect = async ({
	ctx,
	events,
	customerId,
	status,
	lane = "batch",
	reason,
	planChangeActions,
	planChangePlanIds,
	itemChangeCount,
	itemChanges,
	balanceFeatureIds,
	createdFlagFeatureIds,
	flagChanges,
}: {
	ctx: ScenarioCtx;
	events: MigrationItemEvents;
	customerId: string;
	status: "succeeded" | "skipped";
	lane?: string;
	/** Skip reason, for skipped events. */
	reason?: string;
	/** Actions on the synthesized plan changes, in order. */
	planChangeActions?: CustomerPlanChange["action"][];
	/** subscription/purchase plan_id per plan change, in order. */
	planChangePlanIds?: string[];
	/** Items added across the first plan change. */
	itemChangeCount?: number;
	/** Ordered item changes across the first plan change. */
	itemChanges?: {
		action: "created" | "deleted";
		featureId: string;
		included?: number;
	}[];
	/** Features expected to carry a balance change, in order. */
	balanceFeatureIds?: string[];
	/** Boolean features expected to be flagged as created, in order. */
	createdFlagFeatureIds?: string[];
	/** Exact ordered boolean flag changes. */
	flagChanges?: {
		action: "created" | "deleted";
		featureId: string;
	}[];
}) => {
	const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
	const event = events.find(
		(candidate) => candidate.item_id === internalCustomerId,
	);

	expect(event, `Missing item event for ${customerId}`).toBeDefined();
	expect(event?.status).toBe(status);
	expect(event?.item_preview).toMatchObject({ id: customerId });

	const response = event?.response as EventResponse | null;
	expect(response?.lane).toBe(lane);

	if (typeof reason !== "undefined") {
		expect(response?.reason).toBe(reason);
	}

	if (status === "succeeded") {
		expect(response?.preview?.customer_id).toBe(customerId);
	}

	if (planChangeActions) {
		expect(
			response?.preview?.plan_changes?.map((change) => change.action),
		).toEqual(planChangeActions);
	}
	if (planChangePlanIds) {
		expect(
			response?.preview?.plan_changes?.map(
				(change) =>
					(
						change as {
							subscription?: { plan_id?: string };
							purchase?: { plan_id?: string };
						}
					).subscription?.plan_id ??
					(change as { purchase?: { plan_id?: string } }).purchase?.plan_id,
			),
		).toEqual(planChangePlanIds);
	}

	const firstPlanChange = response?.preview?.plan_changes?.[0];
	if (typeof itemChangeCount !== "undefined" || itemChanges !== undefined) {
		expect(firstPlanChange?.item_changes ?? []).toEqual([]);
		expect(firstPlanChange?.previous_attributes ?? null).toBeNull();
		expect(
			firstPlanChange?.plan_change?.previous_attributes ?? null,
		).toBeNull();
	}

	if (typeof itemChangeCount !== "undefined") {
		expect(firstPlanChange?.plan_change?.item_changes ?? []).toHaveLength(
			itemChangeCount,
		);
	}
	if (itemChanges) {
		const actualItemChanges = firstPlanChange?.plan_change?.item_changes ?? [];
		expect(actualItemChanges).toHaveLength(itemChanges.length);
		for (const [index, itemChange] of itemChanges.entries()) {
			expect(actualItemChanges[index]).toMatchObject({
				action: itemChange.action,
				feature_id: itemChange.featureId,
				...(itemChange.included === undefined
					? {}
					: { item: { included: itemChange.included } }),
			});
		}
	}

	if (balanceFeatureIds) {
		expect(
			response?.preview?.balance_changes?.map((change) => change.feature_id),
		).toEqual(balanceFeatureIds);
	}

	if (createdFlagFeatureIds) {
		expect(response?.preview?.flag_changes).toEqual(
			createdFlagFeatureIds.map((featureId) => ({
				action: "created",
				feature_id: featureId,
			})),
		);
	}
	if (flagChanges) {
		expect(response?.preview?.flag_changes).toEqual(
			flagChanges.map(({ action, featureId }) => ({
				action,
				feature_id: featureId,
			})),
		);
	}
};
