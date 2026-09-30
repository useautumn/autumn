import type { AutumnLogger } from "@autumn/logging";
import type { PostgresDb } from "@autumn/postgres";
import type { GetAtomClient } from "../../../atom/types/atomClient.js";

export type CatalogPushContext = {
	logger: Pick<AutumnLogger, "warn">;
	db: PostgresDb;
	getAtomClient: GetAtomClient;
};
