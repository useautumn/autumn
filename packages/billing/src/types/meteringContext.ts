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
	autumn: AutumnClient;
};
