import type { AxiomClient } from "@autumn/axiom";
import type { FxClient } from "@autumn/fx";
import type { AutumnLogger } from "@autumn/logging";
import type { AutumnClient } from "./autumnClient";
import type { PostgresDb } from "./postgresDb";

export type MeteringContext = {
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	axiom: AxiomClient;
	db: PostgresDb;
	fx: FxClient;
	/** Metering only tracks and creates customers; feature checks aren't its business. */
	autumn: Pick<AutumnClient, "batchTrack" | "getOrCreateCustomer">;
};
