import { TinybirdClient } from "@tinybirdco/sdk";

const TINYBIRD_API_URL = process.env.TINYBIRD_API_URL;
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN;

export type TinybirdMigrationCustomerEvent = {
	id: string;
	timestamp: string;
	org_id: string;
	env: string;
	migration_id: string;
	migration_run_id: string;
	event_type: string;
	dry_run: number;
	internal_customer_id: string | null;
	customer_id: string | null;
	details: string | null;
};

export const migrationCustomerEventsTinybird =
	TINYBIRD_API_URL && TINYBIRD_TOKEN
		? new TinybirdClient({
				baseUrl: TINYBIRD_API_URL,
				token: TINYBIRD_TOKEN,
				devMode: false,
			})
		: null;

export const isMigrationCustomerEventsTinybirdConfigured = (): boolean =>
	migrationCustomerEventsTinybird !== null;
