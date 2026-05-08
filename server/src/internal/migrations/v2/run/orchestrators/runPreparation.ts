import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import { runPrepare } from "../../prepare/runPrepare.js";
import type {
	PreparedState,
	PrepareResponse,
} from "../../prepare/types/index.js";

/**
 * Run-phase wrapper around the prepare orchestrator. Returns the
 * freshly written `prepared_state` so per-item handlers can read it
 * without re-fetching the migration row.
 *
 * On `dry_run: true` this still computes and returns the planned
 * `prepared_state` shape (so dry-run end-to-end can show what each
 * customer would see) — but the migrations row is not updated.
 */
export const runPreparation = async ({
	ctx,
	migration,
	dry_run,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dry_run: boolean;
}): Promise<{ response: PrepareResponse; prepared_state: PreparedState }> =>
	runPrepare({ ctx, migration, dry_run });
