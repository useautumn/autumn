import { resolve } from "node:path";
import { recordWarmCost } from "../../costs/repos/warmCostRepo.ts";
import type { JobHandler } from "../../jobs/types/jobHandler.ts";
import { warmImageExists, warmImageTag } from "../modal/modalClient.ts";
import {
	getWarmImage,
	isWarmImageFresh,
	upsertWarmImage,
} from "../repos/warmImagesRepo.ts";
import { spawnTwChild } from "../spawnTwChild.ts";
import type { WarmChildMessage } from "../types/swarmMessages.ts";

const WARM_ENTRY = resolve(import.meta.dir, "warmProcess/warmProcess.ts");
const LOG_TAIL_LINES = 40;
const BUILD_START_MARKER = "warm-up: building warm parent";

export const handleWarmJob: JobHandler = async ({ ctx, job, signal }) => {
	const { sha, branch } = job.payload as { sha: string; branch: string };
	const imageTag = warmImageTag({ sha });
	if (
		isWarmImageFresh({ row: await getWarmImage({ ctx, sha }) }) &&
		(await warmImageExists({ sha }))
	)
		return;

	await upsertWarmImage({
		ctx,
		sha,
		branch,
		status: "building",
		jobId: job.id,
	});
	const tail: string[] = [];
	let done: Extract<WarmChildMessage, { type: "done" }> | undefined;
	let buildStartedAt: number | undefined;
	let buildEndedAt: number | undefined;
	const { exitCode } = await spawnTwChild<WarmChildMessage>({
		entry: WARM_ENTRY,
		init: { type: "init", sha, branch },
		env: { TW_MODAL_NO_STALE: "1" },
		signal,
		logger: ctx.logger,
		onMessage: (message) => {
			if (message.type === "done") {
				done = message;
				buildEndedAt = Date.now();
				return;
			}
			if (
				buildStartedAt === undefined &&
				message.text.includes(BUILD_START_MARKER)
			)
				buildStartedAt = Date.now();
			tail.push(message.text);
			if (tail.length > LOG_TAIL_LINES) tail.shift();
		},
	});
	const warmCost = {
		ctx,
		sha,
		buildSeconds:
			buildStartedAt === undefined
				? 0
				: ((buildEndedAt ?? Date.now()) - buildStartedAt) / 1000,
		createdBy: job.createdBy,
	};

	if (done?.ok && exitCode === 0) {
		await upsertWarmImage({
			ctx,
			sha,
			branch,
			status: "ready",
			jobId: job.id,
			imageTag,
		});
		await recordWarmCost(warmCost);
		return;
	}
	const error = signal.aborted
		? "warm build cancelled"
		: `${done?.error ?? `warm child exited ${exitCode}`}\n${tail.join("\n")}`.slice(
				0,
				8000,
			);
	await upsertWarmImage({
		ctx,
		sha,
		branch,
		status: "failed",
		jobId: job.id,
		error,
	});
	await recordWarmCost(warmCost);
	throw new Error(error);
};
