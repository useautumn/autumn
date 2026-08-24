import type { AutumnLogger } from "@autumn/logging";
import type { PostgresDb } from "@autumn/postgres";
import type { AppEnv } from "@autumn/shared";

export type StaleSubject = {
	orgId: string;
	env: AppEnv;
	customerId: string;
};

export type StalenessContext = {
	postgres: PostgresDb;
	logger: AutumnLogger;
	intervalMs: number;
};
