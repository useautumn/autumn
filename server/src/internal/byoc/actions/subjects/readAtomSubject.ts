import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import {
	type AtomSubjectBody,
	atomSubjectBodyFor,
	isWorkerSubjectNotFound,
	orgToAtomTargets,
	readAtomSubjectBody,
} from "@autumn/byoc/subjects";
import type { AppEnv, Organization } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resolveBalanceWorkerRouting } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { resolveRolloutOrgId } from "@/internal/misc/rollouts/resolveRolloutOrgId.js";
import { getShadowAtomConfig } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";

export type ReadAtomSubjectResult =
	| { kind: "body"; body: AtomSubjectBody }
	| { kind: "not_found" | "not_held" | "worker_unavailable" };

/** A pulled copy stays current only while herald keeps pushing it, so an Atom may pull just what herald pushes it. */
const isPushedToAtom = ({
	org,
	atom,
	customerId,
}: {
	org: Organization;
	atom: { env: AppEnv; encryptedToken: string };
	customerId: string;
}): boolean => {
	const isTarget = orgToAtomTargets({
		shadowAtomConfig: getShadowAtomConfig(),
		org,
		env: atom.env,
		customerId,
	}).some((connection) => connection.encryptedToken === atom.encryptedToken);
	const isOnWorker = resolveBalanceWorkerRouting({
		orgId: resolveRolloutOrgId({ org }),
		customerId,
	});
	return isTarget && isOnWorker;
};

/** The subjects.set body herald would push this Atom for the subject now, read through the one builder herald uses. */
export const readAtomSubject = async ({
	ctx,
	org,
	atom,
	customerId,
	entityId,
	client,
}: {
	ctx: Pick<AutumnContext, "logger" | "id">;
	org: Organization;
	atom: { id: string; env: AppEnv; encryptedToken: string };
	customerId: string;
	entityId: string | null;
	client?: Pick<BalanceWorkerClient, "readSubjectState">;
}): Promise<ReadAtomSubjectResult> => {
	if (!isPushedToAtom({ org, atom, customerId })) return { kind: "not_held" };
	try {
		const body = await readAtomSubjectBody({
			ctx: { balanceWorkerClient: client ?? getBalanceWorkerClient() },
			identity: { orgId: org.id, env: atom.env, customerId, entityId },
			org,
			requestId: ctx.id,
		});
		if (!body) return { kind: "worker_unavailable" };
		return {
			kind: "body",
			body: atomSubjectBodyFor({ body, atomId: atom.id }),
		};
	} catch (error) {
		if (isWorkerSubjectNotFound({ error })) return { kind: "not_found" };
		ctx.logger.warn("An Atom's pull could not read the subject's worker", {
			type: "atom_subject_read_failed",
			error,
		});
		return { kind: "worker_unavailable" };
	}
};
