import { and, eq, ne } from "drizzle-orm";
import { qaEnvs } from "../../../db/schema/qaEnvs.ts";
import { openSecret } from "../../../lib/secretBox.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { JobHandler } from "../../jobs/types/jobHandler.ts";
import { deleteQaEnv } from "../actions/deleteQaEnv.ts";
import {
	createNeonBranch,
	deleteNeonBranch,
	extendNeonBranch,
	neonConnectionUrl,
	resolveNeonBranchId,
} from "../neon/neonBranches.ts";
import { requireQaEnvRow } from "../repos/qaEnvsRepo.ts";
import { archiveSourceAtSha } from "../source/archiveSourceAtSha.ts";
import { qaWorker } from "../worker/qaWorkerClient.ts";

const POLL_MS = 3_000;
const BUILD_TIMEOUT_MS = 20 * 60_000;

export type QaJobPayload = { name: string };

const updateLiveRow = ({
	ctx,
	name,
	set,
}: {
	ctx: TwdContext;
	name: string;
	set: Partial<typeof qaEnvs.$inferInsert>;
}) =>
	ctx.db
		.update(qaEnvs)
		.set({ ...set, updatedAt: new Date() })
		.where(and(eq(qaEnvs.name, name), ne(qaEnvs.state, "deleted")));

export const handleQaJob: JobHandler = async ({ ctx, job, signal }) => {
	const { name } = job.payload as QaJobPayload;
	const assertLive = () => {
		if (signal.aborted) throw new Error("cancelled");
	};

	for (;;) {
		const row = await requireQaEnvRow({ ctx, name });
		if (row.state === "deleted" || row.appliedVersion >= row.requestVersion)
			return;
		const version = row.requestVersion;
		let unadoptedBranchId: string | null = null;
		let buildId: string | null = null;

		try {
			let branchId = row.neonBranchId;
			let replacedBranchId: string | null = null;
			if (!branchId || row.freshDbRequested) {
				const parentId = await resolveNeonBranchId({
					ctx,
					branch: row.parentBranch,
				});
				assertLive();
				replacedBranchId = branchId;
				branchId = await createNeonBranch({
					ctx,
					parentId,
					name: `qa-${name}-${Date.now()}`,
					expiresAt: row.expiresAt,
					signal,
				});
				if (replacedBranchId) {
					unadoptedBranchId = branchId;
					await extendNeonBranch({
						ctx,
						branchId: replacedBranchId,
						expiresAt: row.expiresAt,
					});
				}
				if (!replacedBranchId)
					await updateLiveRow({ ctx, name, set: { neonBranchId: branchId } });
			} else {
				await extendNeonBranch({ ctx, branchId, expiresAt: row.expiresAt });
			}

			const secrets = JSON.parse(
				openSecret({ sealed: row.sealedSecrets }),
			) as Record<string, string>;
			const DATABASE_URL = await neonConnectionUrl({ ctx, branchId });
			assertLive();
			({ buildId } = await qaWorker.begin({
				ctx,
				name,
				input: {
					sha: row.sha,
					ref: row.ref,
					neonBranchId: branchId,
					runtimeEnv: { ...secrets, DATABASE_URL },
					tinybird: row.tinybird,
				},
			}));
			const tarball = await archiveSourceAtSha({ sha: row.sha });
			const upload = await qaWorker.uploadSource({
				ctx,
				name,
				buildId,
				tarball,
			});
			if (upload.exitCode !== 0 || upload.bytes !== tarball.size)
				throw new Error(
					`source upload failed: ${JSON.stringify(upload)} for ${tarball.size} bytes`,
				);
			await qaWorker.build({ ctx, name, buildId });
			ctx.logger.info("qa build started", {
				name,
				sha: row.sha,
				buildId,
				version,
			});

			const deadline = Date.now() + BUILD_TIMEOUT_MS;
			let status = await qaWorker.status({ ctx, name });
			while (
				status.pendingBuild?.buildId === buildId &&
				Date.now() < deadline
			) {
				assertLive();
				await Bun.sleep(POLL_MS);
				status = await qaWorker.status({ ctx, name });
			}
			const result =
				status.lastBuild?.buildId === buildId ? status.lastBuild : undefined;
			if (!result?.ok)
				throw new Error(result?.log?.slice(-2000) ?? "build timed out");

			unadoptedBranchId = null;
			await updateLiveRow({
				ctx,
				name,
				set: {
					state: "ready",
					error: null,
					neonBranchId: branchId,
					appliedVersion: version,
				},
			});
			if (replacedBranchId)
				await deleteNeonBranch({ ctx, branchId: replacedBranchId }).catch(
					(error: unknown) =>
						ctx.logger.warn("replaced qa branch delete failed", {
							name,
							branchId: replacedBranchId,
							error: String(error),
						}),
				);
			await ctx.db
				.update(qaEnvs)
				.set({ freshDbRequested: false, supersedes: null })
				.where(and(eq(qaEnvs.name, name), eq(qaEnvs.requestVersion, version)));
			if (row.supersedes && row.supersedes !== name)
				await deleteQaEnv({ ctx, name: row.supersedes }).catch(
					(error: unknown) =>
						ctx.logger.warn("superseded qa env delete failed", {
							name: row.supersedes,
							error: String(error),
						}),
				);
		} catch (error) {
			const cancelled = buildId
				? await qaWorker.cancelBuild({ ctx, name, buildId }).then(
						() => true,
						() => false,
					)
				: true;
			if (unadoptedBranchId && cancelled)
				await deleteNeonBranch({ ctx, branchId: unadoptedBranchId }).catch(
					() => undefined,
				);
			const message = error instanceof Error ? error.message : String(error);
			const current = await requireQaEnvRow({ ctx, name });
			if (current.requestVersion > version && !signal.aborted) continue;
			await updateLiveRow({
				ctx,
				name,
				set: {
					state: current.state === "ready" ? "ready" : "failed",
					error: message.slice(-2000),
				},
			});
			throw error;
		}
	}
};
