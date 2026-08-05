import { expect } from "bun:test";
import type { TinybirdMigrationItemEvent } from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";
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
	preview?: {
		customer_id?: string;
		plan_changes?: { action: string; item_changes: unknown[] }[];
		balance_changes?: { feature_id: string }[];
		flag_changes?: { action: string; feature_id: string }[];
	} | null;
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
	balanceFeatureIds,
	createdFlagFeatureIds,
}: {
	ctx: ScenarioCtx;
	events: MigrationItemEvents;
	customerId: string;
	status: "succeeded" | "skipped";
	lane?: string;
	/** Skip reason, for skipped events. */
	reason?: string;
	/** Actions on the synthesized plan changes, in order. */
	planChangeActions?: string[];
	/** subscription/purchase plan_id per plan change, in order. */
	planChangePlanIds?: string[];
	/** Items added across the first plan change. */
	itemChangeCount?: number;
	/** Features expected to carry a balance change, in order. */
	balanceFeatureIds?: string[];
	/** Boolean features expected to be flagged as created, in order. */
	createdFlagFeatureIds?: string[];
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

	if (typeof itemChangeCount !== "undefined") {
		expect(response?.preview?.plan_changes?.[0]?.item_changes).toHaveLength(
			itemChangeCount,
		);
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
};
