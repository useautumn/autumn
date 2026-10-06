import { eq } from "drizzle-orm";
import { runs } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { listFileProfiles, upsertFileProfiles } from "../repos/fileProfiles.ts";
import { collectRunSamples } from "./collectRunSamples.ts";
import { foldFileProfile } from "./foldFileProfile.ts";
import { getWorkerClass } from "./getWorkerClass.ts";

/** Completed runs only; a grep run executes a subset of each file, so its timings mislead. */
export const feedsFileProfiles = ({
	status,
	grep,
}: {
	status: string;
	grep: string | undefined;
}) => (status === "passed" || status === "failed") && !grep;

/** Folds a finished run's first attempts into file_profiles (baselines and normal runs alike). */
export const updateFileProfiles = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}): Promise<{ files: number }> => {
	const [run] = await ctx.db
		.select({ status: runs.status, selection: runs.selection })
		.from(runs)
		.where(eq(runs.id, runId));
	if (
		!run ||
		!feedsFileProfiles({ status: run.status, grep: run.selection.grep })
	)
		return { files: 0 };

	const samples = await collectRunSamples({ ctx, runId });
	if (samples.size === 0) return { files: 0 };
	const workerClass = getWorkerClass();
	const previous = new Map(
		(
			await listFileProfiles({ ctx, workerClass, files: [...samples.keys()] })
		).map((profile) => [profile.file, profile]),
	);
	const unfolded = [...samples].filter(
		([file]) => previous.get(file)?.lastRunId !== runId,
	);
	const profiles = unfolded.map(([file, sample]) =>
		foldFileProfile({
			previous: previous.get(file),
			sample,
			file,
			workerClass,
			runId,
		}),
	);
	await upsertFileProfiles({ ctx, profiles });
	ctx.logger.info("file profiles updated", { runId, files: profiles.length });
	return { files: profiles.length };
};
