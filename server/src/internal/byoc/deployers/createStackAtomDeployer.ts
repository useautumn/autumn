import {
	type AppEnv,
	ByocCacheStatus,
	ErrCode,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import { z } from "zod/v4";
import { cacheExternalId } from "../utils/byocCacheUtils.js";
import type {
	AtomDeployer,
	AtomDeployment,
	AtomSetup,
} from "./types/atomDeployer.js";

type StackContext = { atomUrl: string };

const STACK_ATOM_TIMEOUT_MS = 2000;

const GetAtomResponseSchema = z.object({
	atom: z.object({ id: z.string() }).nullable(),
});

const stackAtomUnavailable = ({
	route,
	detail,
}: {
	route: string;
	detail: string;
}) =>
	new RecaseError({
		message: "This dev stack's Atom is not answering. Is `bun d` running it?",
		code: ErrCode.ByocUnavailable,
		statusCode: 503,
		data: { route, detail },
	});

const sendToStackAtom = async ({
	ctx,
	route,
	body,
}: {
	ctx: StackContext;
	route: "atoms.put" | "atoms.get" | "atoms.delete";
	body: Record<string, string>;
}): Promise<Response> => {
	try {
		return await fetch(`${ctx.atomUrl}/v1/${route}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(STACK_ATOM_TIMEOUT_MS),
		});
	} catch (error) {
		throw stackAtomUnavailable({ route, detail: String(error) });
	}
};

/** One call to the dev-only routes of the stack's Atom process. */
const postToStackAtom = async ({
	ctx,
	route,
	body,
}: {
	ctx: StackContext;
	route: "atoms.put" | "atoms.get" | "atoms.delete";
	body: Record<string, string>;
}): Promise<unknown> => {
	const response = await sendToStackAtom({ ctx, route, body });
	if (response.ok) return response.json();
	throw stackAtomUnavailable({ route, detail: await response.text() });
};

const startStackAtom = async ({
	ctx,
	org,
	env,
	tokenHash,
}: {
	ctx: StackContext;
	org: Organization;
	env: AppEnv;
	tokenHash: string;
}): Promise<AtomSetup> => {
	const id = cacheExternalId({ org, env });
	await postToStackAtom({
		ctx,
		route: "atoms.put",
		body: { id, token_hash: tokenHash },
	});
	return { deploymentGroupId: id, setupUrl: null };
};

const findStackAtom = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: StackContext;
	deploymentGroupId: string;
}): Promise<AtomDeployment | null> => {
	const { atom } = GetAtomResponseSchema.parse(
		await postToStackAtom({
			ctx,
			route: "atoms.get",
			body: { id: deploymentGroupId },
		}),
	);
	if (!atom) return null;
	return {
		id: atom.id,
		status: ByocCacheStatus.Ready,
		endpointUrl: ctx.atomUrl,
	};
};

const deleteStackAtom = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: StackContext;
	deploymentGroupId: string;
}): Promise<void> => {
	await postToStackAtom({
		ctx,
		route: "atoms.delete",
		body: { id: deploymentGroupId },
	});
};

/** A dev stack runs one Atom process; every org's Atom is a token and a folder inside it. */
export const createStackAtomDeployer = ({
	atomUrl,
}: {
	atomUrl: string;
}): AtomDeployer => {
	const ctx = { atomUrl };
	return {
		start: (params) => startStackAtom({ ctx, ...params }),
		find: (params) => findStackAtom({ ctx, ...params }),
		delete: (params) => deleteStackAtom({ ctx, ...params }),
	};
};
