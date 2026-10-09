import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { cancelJob } from "../../jobs/actions/cancelJob.ts";
import { deleteNeonBranch } from "../neon/neonBranches.ts";
import { getQaEnvRow, updateQaEnvRow } from "../repos/qaEnvsRepo.ts";
import { qaWorker } from "../worker/qaWorkerClient.ts";

/** Marks the env deleted first so a running qa job stops writing, then removes everything it owns. */
export const deleteQaEnv = async ({
	ctx,
	name,
}: {
	ctx: TwdContext;
	name: string;
}) => {
	const row = await getQaEnvRow({ ctx, name });
	if (row)
		await updateQaEnvRow({
			ctx,
			name,
			set: { state: "deleted", deletedAt: new Date() },
		});
	if (row?.lastJobId)
		await cancelJob({ ctx, jobId: row.lastJobId }).catch(() => undefined);
	await qaWorker.destroy({ ctx, name });
	if (row?.neonBranchId)
		await deleteNeonBranch({ ctx, branchId: row.neonBranchId });
	return { name, deleted: true };
};
