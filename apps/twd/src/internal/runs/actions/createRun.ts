import { eq } from "drizzle-orm";
import type { z } from "zod";
import { CreateRunBody, type RunSummary } from "../../../api/contract.ts";
import { keyGate } from "../../../db/schema/keys.ts";
import { runs } from "../../../db/schema/runs.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { resolveBranchSha } from "../../catalog/actions/gitRemote.ts";
import { resolveTestSelection } from "../../catalog/actions/resolveTestSelection.ts";
import { enqueueJob } from "../../jobs/actions/enqueueJob.ts";
import { getRunWithEmail, toRunSummary, updateRun } from "../repos/runsRepo.ts";
import { getWarmImage, isWarmImageFresh } from "../repos/warmImagesRepo.ts";
import type { RunProgress } from "../types/runProgress.ts";

/** Gate → sha → files → runs row → warm:<sha> (if not ready) → swarm:<runId>. */
export const createRun = async ({
	ctx,
	...input
}: { ctx: TwdContext } & z.input<
	typeof CreateRunBody
>): Promise<RunSummary> => {
	const body = CreateRunBody.parse(input);
	const actor = ctx.actor;
	if (!actor) {
		throw new TwdError({
			status: 401,
			code: "unauthenticated",
			message: "Starting a run needs a signed-in user or an API key.",
			next: "Sign in, or send Authorization: Bearer twd_… .",
		});
	}

	const [gate] = await ctx.db
		.select()
		.from(keyGate)
		.where(eq(keyGate.id, "global"));
	if (gate?.state === "draining") {
		throw new TwdError({
			status: 409,
			code: "keys_draining",
			message: `Stripe keys are being re-initialised${gate.reason ? ` (${gate.reason})` : ""}; new runs are paused.`,
			next: "Poll GET /capacity until gate is open (usually a few minutes), then retry.",
			details: { jobId: gate.jobId },
		});
	}

	if (body.sha && !/^[0-9a-f]{40}$/.test(body.sha)) {
		throw new TwdError({
			status: 400,
			code: "invalid_sha",
			message: `"${body.sha}" is not a full 40-char commit sha.`,
			next: "Omit sha to use the branch head, or pass the full sha.",
		});
	}
	const sha = body.sha ?? (await resolveBranchSha({ branch: body.branch }));
	const files = await resolveTestSelection({
		ctx,
		sha,
		selection: body.selection,
	});

	const progress: RunProgress = { phase: "queued", plannedFiles: files };
	const [run] = await ctx.db
		.insert(runs)
		.values({
			id: `run_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
			branch: body.branch,
			sha,
			pinnedSha: body.sha !== undefined,
			selection: body.selection,
			purpose: body.purpose,
			maxWorkers: body.maxWorkers ?? null,
			fileCount: files.length,
			progress,
			createdBy: actor.userId,
			via: actor.via,
		})
		.returning();

	try {
		if (!isWarmImageFresh({ row: await getWarmImage({ ctx, sha }) })) {
			await enqueueJob({
				ctx,
				kind: "warm",
				singletonKey: `warm:${sha}`,
				payload: { sha, branch: body.branch },
			});
		}
		const { job } = await enqueueJob({
			ctx,
			kind: "swarm",
			singletonKey: `swarm:${run.id}`,
			payload: { runId: run.id },
		});
		await updateRun({ ctx, runId: run.id, set: { jobId: job.id } });
		return toRunSummary(await getRunWithEmail({ ctx, runId: run.id }));
	} catch (error) {
		await updateRun({
			ctx,
			runId: run.id,
			set: { status: "errored", finishedAt: new Date() },
		});
		throw error;
	}
};
