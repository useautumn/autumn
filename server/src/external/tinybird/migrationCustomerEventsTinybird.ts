import { TinybirdClient } from "@tinybirdco/sdk";
import { tinybirdConfig } from "./tinybirdUtils.js";

export const MIGRATION_CUSTOMER_EVENTS_DATASOURCE =
	"migration_customer_events" as const;

export type TinybirdMigrationCustomerEvent = {
	id: string;
	timestamp: string;
	org_id: string;
	env: string;
	migration_id: string;
	migration_run_id: string;
	event_type: string;
	dry_run: 0 | 1;
	internal_customer_id: string | null;
	customer_id: string | null;
	details: string | null;
};

export const migrationCustomerEventsTinybirdClient = tinybirdConfig
	? new TinybirdClient({
			...tinybirdConfig,
			devMode: false,
		})
	: null;
