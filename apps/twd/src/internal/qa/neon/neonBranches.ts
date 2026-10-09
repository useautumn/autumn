import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

const NEON_API = "https://console.neon.tech/api/v2";
const ROLE = "neondb_owner";
const DATABASE = "neondb";

const neonFetch = async <T>({
	ctx,
	path,
	init,
}: {
	ctx: TwdContext;
	path: string;
	init?: RequestInit;
}): Promise<T> => {
	const { QA_NEON_API_KEY, QA_NEON_PROJECT_ID } = ctx.env;
	if (!QA_NEON_API_KEY)
		throw new TwdError({
			status: 503,
			code: "qa_unconfigured",
			message:
				"QA_NEON_API_KEY is not set on twd, so it can't branch QA databases.",
			next: "Ask a twd admin to set QA_NEON_API_KEY.",
		});
	const res = await fetch(`${NEON_API}/projects/${QA_NEON_PROJECT_ID}${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${QA_NEON_API_KEY}`,
			"content-type": "application/json",
			accept: "application/json",
		},
	});
	if (!res.ok)
		throw new TwdError({
			status: res.status === 404 ? 404 : 502,
			code: res.status === 404 ? "neon_branch_not_found" : "neon_error",
			message: `Neon ${init?.method ?? "GET"} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`,
			next: "Check the Capy Neon branch name (bun capy writes it to ~/.autumn-capy/state.json) and retry.",
		});
	return (await res.json()) as T;
};

type NeonBranch = { id: string; name: string };

/** Accepts a branch id (`br-…`) or name (`capy-…`). */
export const resolveNeonBranchId = async ({
	ctx,
	branch,
}: {
	ctx: TwdContext;
	branch: string;
}) => {
	if (branch.startsWith("br-")) return branch;
	const { branches } = await neonFetch<{ branches: NeonBranch[] }>({
		ctx,
		path: `/branches?search=${encodeURIComponent(branch)}`,
	});
	const match = branches.find((b) => b.name === branch);
	if (!match)
		throw new TwdError({
			status: 404,
			code: "neon_branch_not_found",
			message: `No Neon branch named ${branch}.`,
			next: "Pass the branchName from ~/.autumn-capy/state.json; run `bun capy` first if it is missing.",
		});
	return match.id;
};

/** A child branch that Neon itself deletes at `expiresAt`, so a lost env can't leak it. */
export const createNeonBranch = async ({
	ctx,
	parentId,
	name,
	expiresAt,
}: {
	ctx: TwdContext;
	parentId: string;
	name: string;
	expiresAt: Date;
}) => {
	const { branch } = await neonFetch<{ branch: NeonBranch }>({
		ctx,
		path: "/branches",
		init: {
			method: "POST",
			body: JSON.stringify({
				branch: {
					name,
					parent_id: parentId,
					expires_at: expiresAt.toISOString(),
				},
				endpoints: [
					{
						type: "read_write",
						autoscaling_limit_min_cu: 0.25,
						autoscaling_limit_max_cu: 1,
						suspend_timeout_seconds: 300,
					},
				],
			}),
		},
	});
	return branch.id;
};

export const extendNeonBranch = ({
	ctx,
	branchId,
	expiresAt,
}: {
	ctx: TwdContext;
	branchId: string;
	expiresAt: Date;
}) =>
	neonFetch({
		ctx,
		path: `/branches/${branchId}`,
		init: {
			method: "PATCH",
			body: JSON.stringify({ branch: { expires_at: expiresAt.toISOString() } }),
		},
	});

export const deleteNeonBranch = async ({
	ctx,
	branchId,
}: {
	ctx: TwdContext;
	branchId: string;
}) => {
	await neonFetch({
		ctx,
		path: `/branches/${branchId}`,
		init: { method: "DELETE" },
	}).catch((error: unknown) => {
		if (!(error instanceof TwdError && error.status === 404)) throw error;
	});
};

/** Pooled URL, as `bun capy` writes it. */
export const neonConnectionUrl = async ({
	ctx,
	branchId,
}: {
	ctx: TwdContext;
	branchId: string;
}) => {
	const { uri } = await neonFetch<{ uri: string }>({
		ctx,
		path: `/connection_uri?branch_id=${branchId}&database_name=${DATABASE}&role_name=${ROLE}&pooled=true`,
	});
	return uri;
};
