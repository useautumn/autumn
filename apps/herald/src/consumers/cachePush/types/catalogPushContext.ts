import type { EdgeConfigStore, ShadowAtomConfig } from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import type { PostgresDb } from "@autumn/postgres";
import type { GetAtomClient } from "../../../atom/types/atomClient.js";

export type CatalogPushContext = {
	logger: Pick<AutumnLogger, "warn" | "error">;
	db: PostgresDb;
	getAtomClient: GetAtomClient;
	shadowAtomConfig: Pick<EdgeConfigStore<ShadowAtomConfig>, "get">;
};
