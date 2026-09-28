import { resolve } from "node:path";
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

/** payload: { sha, branch }. Builds + publishes tw-warm:<sha12>. Exact image → ready at once. */
export const handleWarmJob: JobHandler = async ({ ctx, job, signal }) => {
	const { sha, branch } = job.payload as { sha: string; branch: string };
	const imageTag = warmImageTag({ sha });
	// Only trust an existing tag we know is young; an unknown or ageing one is rebuilt with a fresh TTL.
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
	const { exitCode } = await spawnTwChild<WarmChildMessage>({
		entry: WARM_ENTRY,
		init: { type: "init", sha },
		// Exact-sha images only: a stale :latest hit would not publish this sha.
		env: { TW_MODAL_NO_STALE: "1" },
		signal,
		logger: ctx.logger,
		onMessage: (message) => {
			if (message.type === "done") {
				done = message;
				return;
			}
			tail.push(message.text);
			if (tail.length > LOG_TAIL_LINES) tail.shift();
		},
	});

	if (done?.ok && exitCode === 0) {
		await upsertWarmImage({
			ctx,
			sha,
			branch,
			status: "ready",
			jobId: job.id,
			imageTag,
		});
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
	throw new Error(error);
};
