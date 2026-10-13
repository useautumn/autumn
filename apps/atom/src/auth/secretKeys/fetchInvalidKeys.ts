import type { AutumnLogger } from "@autumn/logging";
import type { AutumnClient } from "../../autumnClient/types/autumnClient.js";

/** Null for any reply that is not a clear answer, so a failed or slow call never drops a key. */
export const fetchInvalidKeys = async ({
	ctx,
	keyHashes,
}: {
	ctx: {
		autumnClient: Pick<AutumnClient, "findInvalidKeys">;
		tokenHash: string;
		logger: Pick<AutumnLogger, "warn">;
	};
	keyHashes: string[];
}): Promise<string[] | null> => {
	try {
		return await ctx.autumnClient.findInvalidKeys({
			tokenHash: ctx.tokenHash,
			keyHashes,
		});
	} catch (error) {
		ctx.logger.warn(
			{ type: "atom_secret_keys_sync_failed", error },
			"Could not check the Atom's secret keys with Autumn",
		);
		return null;
	}
};
