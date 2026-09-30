import { z } from "zod";
import type { EnqueueResponse } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { warmBranch } from "../../catalog/actions/warmBranch.ts";

const WARM_ON_PUSH = ["dev", "main"];
const WARM_PR_ACTIONS = ["opened", "synchronize", "reopened"];

const PushEvent = z.object({
	ref: z.string(),
	after: z.string(),
	deleted: z.boolean().optional(),
});

const PullRequestEvent = z.object({
	action: z.string(),
	pull_request: z.object({
		number: z.number(),
		state: z.string(),
		head: z.object({
			ref: z.string(),
			sha: z.string(),
			repo: z.object({ full_name: z.string() }).nullable(),
		}),
	}),
	repository: z.object({ full_name: z.string() }),
});

export type GithubEventOutcome =
	| { handled: true; branch: string; sha: string; enqueue: EnqueueResponse }
	| { handled: false; reason: string };

const ignored = (reason: string): GithubEventOutcome => ({
	handled: false,
	reason,
});

/** push to dev/main or PR opened/synchronize/reopened → warm the head sha; else ignore. */
export const handleGithubEvent = async ({
	ctx,
	event,
	payload,
}: {
	ctx: TwdContext;
	event: string;
	payload: unknown;
}): Promise<GithubEventOutcome> => {
	let target: { branch: string; sha: string } | undefined;

	if (event === "push") {
		const push = PushEvent.safeParse(payload);
		if (!push.success) return ignored("unrecognised push payload");
		const branch = push.data.ref.replace(/^refs\/heads\//, "");
		if (
			!push.data.ref.startsWith("refs/heads/") ||
			!WARM_ON_PUSH.includes(branch)
		)
			return ignored(
				`push to ${push.data.ref} (PR branches warm via pull_request)`,
			);
		if (push.data.deleted || /^0+$/.test(push.data.after))
			return ignored(`branch ${branch} deleted`);
		target = { branch, sha: push.data.after };
	} else if (event === "pull_request") {
		const pr = PullRequestEvent.safeParse(payload);
		if (!pr.success) return ignored("unrecognised pull_request payload");
		const { action, pull_request, repository } = pr.data;
		if (!WARM_PR_ACTIONS.includes(action))
			return ignored(`pull_request.${action}`);
		if (pull_request.head.repo?.full_name !== repository.full_name)
			return ignored(`PR #${pull_request.number} is from a fork`);
		target = { branch: pull_request.head.ref, sha: pull_request.head.sha };
	} else {
		return ignored(`event ${event}`);
	}

	const enqueue = await warmBranch({ ctx, ...target });
	ctx.logger.info("github auto-warm", {
		event,
		...target,
		jobId: enqueue.job.id,
		deduped: enqueue.deduped,
	});
	return { handled: true, ...target, enqueue };
};
