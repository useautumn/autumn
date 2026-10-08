import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { deleteNeonBranch } from "../neon/neonBranches.ts";
import { getQaEnvRow, updateQaEnvRow } from "../repos/qaEnvsRepo.ts";
import { qaWorker } from "../worker/qaWorkerClient.ts";

/** Stops the container, removes the hostname, Stripe routes and snapshot, and deletes the Neon branch. */
export const deleteQaEnv = async ({
	ctx,
	name,
}: {
	ctx: TwdContext;
	name: string;
}) => {
	const row = await getQaEnvRow({ ctx, name });
	await qaWorker.destroy({ ctx, name });
	if (row?.neonBranchId)
		await deleteNeonBranch({ ctx, branchId: row.neonBranchId });
	if (row)
		await updateQaEnvRow({
			ctx,
			name,
			set: { state: "deleted", deletedAt: new Date() },
		});
	return { name, deleted: true };
};
