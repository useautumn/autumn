import * as crypto from "node:crypto";
import type { TinybirdMigrationCustomerEvent } from "@/external/tinybird/initTinybird.js";
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
	orgId: event.orgId,
	env: event.env,
	migrationId: event.migrationId,
	migrationRunId: event.migrationRunId,
	eventType: event.eventType,
	dryRun: event.dryRun ? 1 : 0,
	internalCustomerId: event.internalCustomerId ?? null,
	customerId: event.customerId ?? null,
	details: stringifyDetails({ details: event.details }),
});
