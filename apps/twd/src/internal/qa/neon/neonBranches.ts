import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { copyNeonDatabase } from "./copyNeonDatabase.ts";

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

type NeonBranch = {
	id: string;
	name: string;
	parent_id?: string;
	expires_at?: string | null;
};

const getNeonBranch = async ({
	ctx,
	branchId,
}: {
	ctx: TwdContext;
	branchId: string;
}) =>
	(
		await neonFetch<{ branch: NeonBranch }>({
			ctx,
			path: `/branches/${branchId}`,
		})
	).branch;

/** Neon deletes an expiring branch with its data, so only a non-expiring one may have children. */
const findNonExpiringAncestor = async ({
	ctx,
	branch,
}: {
	ctx: TwdContext;
	branch: NeonBranch;
}): Promise<string> => {
	if (!branch.expires_at) return branch.id;
	if (!branch.parent_id)
		throw new TwdError({
			status: 409,
			code: "neon_no_branchable_ancestor",
			message: `Neon branch ${branch.name} expires and has no non-expiring ancestor to branch from.`,
			next: "Ask a twd admin to check the Neon project's branch tree.",
		});
	return findNonExpiringAncestor({
		ctx,
		branch: await getNeonBranch({ ctx, branchId: branch.parent_id }),
	});
};

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

/**
 * A branch holding the parent's current data, which Neon itself deletes at `expiresAt`.
 * Neon refuses children of an expiring parent, so those are copied onto a branch of its nearest non-expiring ancestor.
 */
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
	const parent = await getNeonBranch({ ctx, branchId: parentId });
	if (!parent.expires_at)
		return createChildBranch({ ctx, parentId, name, expiresAt });

	const branchId = await createChildBranch({
		ctx,
		parentId: await findNonExpiringAncestor({ ctx, branch: parent }),
		name,
		expiresAt,
	});
	try {
		await copyNeonDatabase({
			from: await neonConnectionUrl({ ctx, branchId: parentId, pooled: false }),
			to: await neonConnectionUrl({ ctx, branchId, pooled: false }),
		});
	} catch (error) {
		await deleteNeonBranch({ ctx, branchId }).catch(() => {});
		throw error;
	}
	return branchId;
};

const createChildBranch = async ({
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

/** Pooled by default, as `bun capy` writes it. */
export const neonConnectionUrl = async ({
	ctx,
	branchId,
	pooled = true,
}: {
	ctx: TwdContext;
	branchId: string;
	pooled?: boolean;
}) => {
	const { uri } = await neonFetch<{ uri: string }>({
		ctx,
		path: `/connection_uri?branch_id=${branchId}&database_name=${DATABASE}&role_name=${ROLE}&pooled=${pooled}`,
	});
	return uri;
};
