import { flushBatch } from "./actions/flushBatch.js";
import type { Committer, CommitterContext } from "./types/committer.js";

export const createCommitter = ({
	ctx,
}: {
	ctx: CommitterContext;
}): Committer => ({
	apply: (params) => flushBatch({ ctx, ...params }),
});
