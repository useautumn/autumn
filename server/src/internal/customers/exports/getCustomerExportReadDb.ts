import { type DrizzleCli, dbReplica } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Export reads scan whole orgs; the replica absorbs that instead of the primary. */
export const getCustomerExportReadDb = ({
	ctx,
}: {
	ctx: AutumnContext;
}): DrizzleCli => dbReplica ?? ctx.db;
