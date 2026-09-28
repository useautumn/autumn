import { inArray } from "drizzle-orm";
import type { EnqueueResponse } from "../../../api/contract.ts";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { enqueueNukeJobs } from "./enqueueNukeJobs.ts";
import { toEnqueueResponses } from "./toEnqueueResponses.ts";

/** Manual nuke of clean/nuking/broken accounts; in_use accounts are refused. */
export const nukeAccounts = async ({
	ctx,
	accountIds,
}: {
	ctx: TwdContext;
	accountIds: string[];
}): Promise<EnqueueResponse[]> => {
	const ids = [...new Set(accountIds)];
	const rows = await ctx.db
		.select({
			id: stripeAccounts.id,
			state: stripeAccounts.state,
			runId: stripeAccounts.runId,
		})
		.from(stripeAccounts)
		.where(inArray(stripeAccounts.id, ids));
	const known = new Set(rows.map((row) => row.id));
	const unknown = ids.filter((id) => !known.has(id));
	if (unknown.length) {
		throw new TwdError({
			status: 404,
			code: "unknown_accounts",
			message: `Not in the twd ledger: ${unknown.join(", ")}.`,
			next: "GET /accounts for valid ids; POST /keys/reinit imports pool accounts from Stripe.",
			details: { unknown },
		});
	}
	const held = rows.filter((row) => row.state === "in_use");
	if (held.length) {
		throw new TwdError({
			status: 409,
			code: "accounts_held",
			message: `Accounts are held by a run: ${held.map((row) => `${row.id} (run ${row.runId})`).join(", ")}.`,
			next: "Wait for the run to finish (or cancel it); its teardown nukes them.",
			details: { held },
		});
	}
	const results = await enqueueNukeJobs({ ctx, accountIds: ids });
	return toEnqueueResponses({ ctx, results });
};
