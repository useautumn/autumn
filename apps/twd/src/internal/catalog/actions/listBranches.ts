import type { Branch } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	isWarmImageFresh,
	listWarmImages,
} from "../../runs/repos/warmImagesRepo.ts";
import { getRepoSlug, listRemoteHeads } from "./gitRemote.ts";

const BASE_BRANCHES = ["main", "dev"];
const MAX_PR_PAGES = 3;

type GithubPull = {
	number: number;
	head: { ref: string; sha: string; repo: { full_name: string } | null };
};

/** Open same-repo PRs; GITHUB_TOKEN raises the anonymous rate limit. */
const listOpenPulls = async ({
	ctx,
	slug,
}: {
	ctx: TwdContext;
	slug: string;
}) => {
	const pulls: GithubPull[] = [];
	try {
		for (let page = 1; page <= MAX_PR_PAGES; page++) {
			const response = await fetch(
				`https://api.github.com/repos/${slug}/pulls?state=open&per_page=100&page=${page}`,
				{
					headers: {
						accept: "application/vnd.github+json",
						...(process.env.GITHUB_TOKEN
							? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
							: {}),
					},
				},
			);
			if (!response.ok) throw new Error(`GitHub ${response.status}`);
			const batch = (await response.json()) as GithubPull[];
			pulls.push(...batch);
			if (batch.length < 100) break;
		}
	} catch (error) {
		ctx.logger.warn("listing open PRs failed; returning base branches only", {
			error: String(error),
		});
	}
	return pulls.filter((pull) => pull.head.repo?.full_name === slug);
};

/** main + dev + every open PR head, with the warm-image state of each head sha. */
export const listBranches = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<Branch[]> => {
	const [heads, pulls] = await Promise.all([
		listRemoteHeads(),
		getRepoSlug().then((slug) => listOpenPulls({ ctx, slug })),
	]);
	const branches = [
		...BASE_BRANCHES.flatMap((name) => {
			const sha = heads.get(name);
			return sha ? [{ name, sha, prNumber: null }] : [];
		}),
		...pulls.map((pull) => ({
			name: pull.head.ref,
			sha: heads.get(pull.head.ref) ?? pull.head.sha,
			prNumber: pull.number,
		})),
	];
	const warm = new Map(
		(
			await listWarmImages({ ctx, shas: branches.map((branch) => branch.sha) })
		).map((row) => [
			row.sha,
			row.status === "ready" && !isWarmImageFresh({ row })
				? ("none" as const)
				: row.status,
		]),
	);
	return branches.map((branch) => ({
		...branch,
		warm: warm.get(branch.sha) ?? "none",
	}));
};
