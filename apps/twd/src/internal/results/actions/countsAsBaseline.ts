import type { RunSelection } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { resolveBranchSha } from "../../catalog/actions/gitRemote.ts";
import { resolveTestSelection } from "../../catalog/actions/resolveTestSelection.ts";
import { BASELINE_BRANCH } from "./refreshBaselines.ts";

/** Candidate at creation: scheduled on dev, or every file at dev's GitHub HEAD; settleBaselineFlag drops it unless it completes. */
export const countsAsBaseline = ({
	purpose,
	branch,
	repeat,
	fullSuite,
	sha,
	devHeadSha,
}: {
	purpose: "adhoc" | "baseline";
	branch: string;
	repeat: number;
	fullSuite: boolean;
	sha: string;
	devHeadSha: string | null;
}) =>
	branch === BASELINE_BRANCH &&
	repeat === 1 &&
	(purpose === "baseline" || (fullSuite && sha === devHeadSha));

const sameFiles = ({ a, b }: { a: string[]; b: string[] }) => {
	const set = new Set(a);
	return a.length === b.length && b.every((file) => set.has(file));
};

/** Decided once at run creation; GitHub or catalog errors mean "not a baseline", never a failed run. */
export const resolveRunIsBaseline = async ({
	ctx,
	branch,
	sha,
	pinnedSha,
	selection,
	purpose,
	repeat,
	files,
}: {
	ctx: TwdContext;
	branch: string;
	sha: string;
	pinnedSha: boolean;
	selection: RunSelection;
	purpose: "adhoc" | "baseline";
	repeat: number;
	files: string[];
}): Promise<boolean> => {
	const base = { purpose, branch, repeat, sha };
	if (countsAsBaseline({ ...base, fullSuite: false, devHeadSha: null }))
		return true;
	if (!countsAsBaseline({ ...base, fullSuite: true, devHeadSha: sha }))
		return false;
	if (selection.grep) return false;
	try {
		const allFiles = await resolveTestSelection({
			ctx,
			sha,
			selection: { groups: ["all"] },
		});
		const devHeadSha = pinnedSha
			? await resolveBranchSha({ branch: BASELINE_BRANCH })
			: sha;
		return countsAsBaseline({
			...base,
			fullSuite: sameFiles({ a: files, b: allFiles }),
			devHeadSha,
		});
	} catch (error) {
		ctx.logger.warn("baseline check failed; run will not feed the baseline", {
			branch,
			sha,
			error: String(error),
		});
		return false;
	}
};
