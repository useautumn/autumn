import { openSecret } from "../../../lib/secretBox.ts";
import type { JobHandler } from "../../jobs/types/jobHandler.ts";
import { deleteQaEnv } from "../actions/deleteQaEnv.ts";
import {
	createNeonBranch,
	deleteNeonBranch,
	extendNeonBranch,
	neonConnectionUrl,
	resolveNeonBranchId,
} from "../neon/neonBranches.ts";
import { requireQaEnvRow, updateQaEnvRow } from "../repos/qaEnvsRepo.ts";
import { archiveSourceAtSha } from "../source/archiveSourceAtSha.ts";
import { qaWorker } from "../worker/qaWorkerClient.ts";

const POLL_MS = 3_000;
const BUILD_TIMEOUT_MS = 20 * 60_000;

export type QaJobPayload = {
	name: string;
	freshDb?: boolean;
	supersedes?: string;
};

/**
 * `qa:<name>`: (re)branch or keep the env's database, hand the Worker a build of the row's sha,
 * wait for it, and loop if the row was re-shipped to a newer sha meanwhile.
 */
export const handleQaJob: JobHandler = async ({ ctx, job, signal }) => {
	const { name, freshDb, supersedes } = job.payload as QaJobPayload;
	let builtSha: string | undefined;

	for (let pass = 0; pass < 3; pass++) {
		const row = await requireQaEnvRow({ ctx, name });
		if (row.state === "deleted" || row.sha === builtSha) break;
		const sha = row.sha;

		let branchId = row.neonBranchId;
		if (!branchId || (freshDb && pass === 0)) {
			const parentId = await resolveNeonBranchId({
				ctx,
				branch: row.parentBranch,
			});
			const fresh = await createNeonBranch({
				ctx,
				parentId,
				name: `qa-${name}-${Date.now()}`,
				expiresAt: row.expiresAt,
			});
			if (branchId) await deleteNeonBranch({ ctx, branchId });
			branchId = fresh;
			await updateQaEnvRow({ ctx, name, set: { neonBranchId: branchId } });
		} else {
			await extendNeonBranch({ ctx, branchId, expiresAt: row.expiresAt });
		}

		const secrets = JSON.parse(
			openSecret({ sealed: row.sealedSecrets }),
		) as Record<string, string>;
		const DATABASE_URL = await neonConnectionUrl({ ctx, branchId });
		const { buildId } = await qaWorker.begin({
			ctx,
			name,
			input: {
				sha,
				ref: row.ref,
				neonBranchId: branchId,
				runtimeEnv: { ...secrets, DATABASE_URL },
			},
		});
		const tarball = await archiveSourceAtSha({ sha });
		const upload = await qaWorker.uploadSource({ ctx, name, buildId, tarball });
		if (upload.exitCode !== 0 || upload.bytes !== tarball.size)
			throw new Error(
				`source upload failed: ${JSON.stringify(upload)} for ${tarball.size} bytes`,
			);
		await qaWorker.build({ ctx, name, buildId });
		ctx.logger.info("qa build started", { name, sha, buildId });

		const deadline = Date.now() + BUILD_TIMEOUT_MS;
		let status = await qaWorker.status({ ctx, name });
		while (status.pendingBuild?.buildId === buildId && Date.now() < deadline) {
			if (signal.aborted) throw new Error("cancelled");
			await Bun.sleep(POLL_MS);
			status = await qaWorker.status({ ctx, name });
		}
		const result =
			status.lastBuild?.buildId === buildId ? status.lastBuild : undefined;
		if (!result?.ok) {
			const error = result?.log?.slice(-2000) ?? "build timed out";
			await updateQaEnvRow({
				ctx,
				name,
				set: { state: status.state === "ready" ? "ready" : "failed", error },
			});
			throw new Error(
				`qa build ${buildId} for ${name}@${sha.slice(0, 12)} failed`,
			);
		}
		await updateQaEnvRow({ ctx, name, set: { state: "ready", error: null } });
		builtSha = sha;
	}

	if (supersedes && supersedes !== name)
		await deleteQaEnv({ ctx, name: supersedes }).catch((error: unknown) =>
			ctx.logger.warn("superseded qa env delete failed", {
				name: supersedes,
				error: String(error),
			}),
		);
};
