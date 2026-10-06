import { inArray } from "drizzle-orm";
import type { FailureTriage, RunFile } from "../../../api/contract.ts";
import { fileBaselines } from "../../../db/schema/results.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	type DevBaseline,
	needsTriage,
	triageFiles,
} from "./classifyFailure.ts";

export const loadDevBaselines = async ({
	ctx,
	files,
}: {
	ctx: TwdContext;
	files: string[];
}): Promise<Map<string, DevBaseline>> => {
	if (files.length === 0) return new Map();
	const rows = await ctx.db
		.select({
			file: fileBaselines.file,
			passRate: fileBaselines.passRate,
			samples: fileBaselines.samples,
		})
		.from(fileBaselines)
		.where(inArray(fileBaselines.file, files));
	return new Map(
		rows.map(({ file, passRate, samples }) => [file, { passRate, samples }]),
	);
};

/** Live triage of a run's failures against dev; skipped for repeat runs, like drift. */
export const triageRunFailures = async ({
	ctx,
	files,
	repeat,
}: {
	ctx: TwdContext;
	files: RunFile[];
	repeat: number;
}): Promise<FailureTriage> => {
	if (repeat > 1) return { summary: "", failures: [] };
	const failing = files.filter(needsTriage);
	const baselines = await loadDevBaselines({
		ctx,
		files: failing.map((file) => file.file),
	});
	return triageFiles({ files: failing, baselines });
};
