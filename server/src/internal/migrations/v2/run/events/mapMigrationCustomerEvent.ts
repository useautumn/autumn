import * as crypto from "node:crypto";
import type { TinybirdMigrationCustomerEvent } from "@/external/tinybird/migrationCustomerEventsTinybird.js";
import type {
	MigrationCustomerEvent,
	MigrationCustomerEventDetails,
} from "./migrationCustomerEventTypes.js";

const stringifyBigInt = (_key: string, value: unknown): unknown =>
	typeof value === "bigint" ? value.toString() : value;

const stringifyDetails = ({
	details,
}: {
	details?: MigrationCustomerEventDetails;
}): string | null => {
	if (!details) return null;
	return JSON.stringify(details, stringifyBigInt);
};

/** Converts a migration event into the Tinybird ingest payload. */
export const mapMigrationCustomerEvent = ({
	event,
}: {
	event: MigrationCustomerEvent;
}): TinybirdMigrationCustomerEvent => ({
	id: `mig_evt_${crypto.randomUUID()}`,
	timestamp: event.timestamp ?? new Date().toISOString(),
	org_id: event.orgId,
	env: event.env,
	migration_id: event.migrationId,
	migration_run_id: event.migrationRunId,
	event_type: event.eventType,
	dry_run: event.dryRun ? 1 : 0,
	internal_customer_id: event.internalCustomerId ?? null,
	customer_id: event.customerId ?? null,
	details: stringifyDetails({ details: event.details }),
});
