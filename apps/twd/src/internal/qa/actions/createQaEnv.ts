import { sql } from "drizzle-orm";
import type {
	CreateQaEnvBody,
	CreateQaEnvResponse,
} from "../../../api/contract.ts";
import { qaEnvs } from "../../../db/schema/qaEnvs.ts";
import { TwdError } from "../../../http/apiError.ts";
import { SYSTEM_ACTOR } from "../../../lib/createContext.ts";
import { sealSecret } from "../../../lib/secretBox.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { resolveBranchSha } from "../../catalog/actions/gitRemote.ts";
import { enqueueJob } from "../../jobs/actions/enqueueJob.ts";
import { getJob } from "../../jobs/actions/getJob.ts";
import type { QaJobPayload } from "../job/handleQaJob.ts";
import { getQaEnvRow, updateQaEnvRow } from "../repos/qaEnvsRepo.ts";
import { toQaEnv } from "./toQaEnv.ts";

const QA_DOMAIN = "atmn.lol";
const TTL_MS = 3 * 24 * 60 * 60_000;
const SHA_RE = /^[0-9a-f]{40}$/;

/** `capy/fix-thing` → `capy-fix-thing`, cut to a DNS label. */
export const defaultQaEnvName = ({ ref }: { ref: string }) =>
	ref
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 42)
		.replace(/-+$/, "") || "qa";

/** Creates `<name>.atmn.lol`, or re-ships it at the new sha keeping its QA data; the 3-day clock restarts. */
export const createQaEnv = async ({
	ctx,
	body,
}: {
	ctx: TwdContext;
	body: CreateQaEnvBody;
}): Promise<CreateQaEnvResponse> => {
	const name = body.name ?? defaultQaEnvName({ ref: body.ref });
	if (body.supersedes === name)
		throw new TwdError({
			status: 400,
			code: "invalid_supersedes",
			message:
				"supersedes names the env being created; re-using a name already replaces its build.",
			next: "Drop supersedes, or pass the old env's name.",
		});
	const sha = SHA_RE.test(body.ref)
		? body.ref
		: await resolveBranchSha({ branch: body.ref });
	const actor = ctx.actor ?? SYSTEM_ACTOR;
	const now = new Date();
	const values = {
		ref: body.ref,
		sha,
		url: `https://${name}.${QA_DOMAIN}`,
		parentBranch: body.parentBranch,
		sealedSecrets: sealSecret({ plaintext: JSON.stringify(body.secrets) }),
		expiresAt: new Date(now.getTime() + TTL_MS),
		error: null,
		deletedAt: null,
	};
	const existing = await getQaEnvRow({ ctx, name });
	// The Worker deletes an expired env's branch on its own, so the row's branch id is stale too.
	const isDead =
		existing?.state === "deleted" ||
		(existing && existing.expiresAt.getTime() < now.getTime());
	const request = {
		freshDbRequested: Boolean(body.freshDb),
		supersedes: body.supersedes ?? null,
	};
	await ctx.db
		.insert(qaEnvs)
		.values({
			name,
			...values,
			...request,
			state: "building",
			createdBy: actor.email,
		})
		.onConflictDoUpdate({
			target: qaEnvs.name,
			set: {
				...values,
				...request,
				...(isDead
					? {
							state: "building" as const,
							neonBranchId: null,
							appliedVersion: 0,
						}
					: {}),
				requestVersion: sql`${qaEnvs.requestVersion} + 1`,
				updatedAt: now,
			},
		});

	const payload: QaJobPayload = { name };
	const { job, deduped } = await enqueueJob({
		ctx,
		kind: "qa",
		singletonKey: `qa:${name}`,
		payload,
	});
	await updateQaEnvRow({ ctx, name, set: { lastJobId: job.id } });
	const row = await getQaEnvRow({ ctx, name });
	if (!row) throw new Error(`qa env ${name} vanished`);
	return {
		env: await toQaEnv({ ctx, row }),
		job: await getJob({ ctx, jobId: job.id }),
		deduped,
	};
};
