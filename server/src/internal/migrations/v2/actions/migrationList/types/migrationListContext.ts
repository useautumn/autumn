import type { FullProduct, Migration } from "@autumn/shared";
import type { MigrationItemRunCountRow } from "../../../repos/index.js";
import type { MigrationRunState } from "../../migrationStatus/types/migrationRunState.js";

export type MigrationListContext = MigrationRunState & {
	migrations: Migration[];
	itemRunCounts: MigrationItemRunCountRow[];
	customerCounts: Map<string, number | null>;
	products: FullProduct[];
};
