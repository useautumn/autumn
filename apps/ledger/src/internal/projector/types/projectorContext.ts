import type { AutumnLogger } from "@autumn/logging";
import type { PostgresDb } from "@autumn/postgres";

export type ProjectorContext = {
	postgres: PostgresDb;
	logger: AutumnLogger;
};
