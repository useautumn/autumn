import {
	type AppEnv,
	type ByocCacheMachine,
	ByocCacheStatus,
	DEFAULT_BYOC_CACHE_MACHINE,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { z } from "zod/v4";
import { cacheExternalId } from "../utils/byocCacheUtils.js";
import { postToMultiTenantAtom } from "./postToMultiTenantAtom.js";
import type {
	AtomAuth,
	AtomDeployer,
	AtomDeployment,
	AtomOwner,
	AtomSetup,
} from "./types/atomDeployer.js";
import type { MultiTenantAtomAddress } from "./types/multiTenantAtom.js";

/** A dev stack has no machines, so each Atom's is only remembered here; a restart resets it to the default. */
type StackContext = {
	atom: MultiTenantAtomAddress;
	machineById: Map<string, ByocCacheMachine>;
};

const GetAtomResponseSchema = z.object({
	atom: z.object({ id: z.string() }).nullable(),
});

const startStackAtom = async ({
	ctx,
	org,
	env,
	auth,
	machine,
}: {
	ctx: StackContext;
	org: AtomOwner;
	env: AppEnv;
	auth: AtomAuth;
	machine: ByocCacheMachine;
}): Promise<AtomSetup> => {
	if (auth.mode === "multi_tenant")
		throw new RecaseError({
			message:
				"The dev stack's Atom is already multi-tenant; it cannot start another.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	const id = cacheExternalId({ org, env });
	await postToMultiTenantAtom({
		atom: ctx.atom,
		route: "atoms.put",
		body: { id, token_hash: auth.tokenHash },
	});
	ctx.machineById.set(id, machine);
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
		await postToMultiTenantAtom({
			atom: ctx.atom,
			route: "atoms.get",
			body: { id: deploymentGroupId },
		}),
	);
	if (!atom) return null;
	return {
		id: atom.id,
		status: ByocCacheStatus.Ready,
		endpointUrl: ctx.atom.atomUrl,
		machine: ctx.machineById.get(atom.id) ?? DEFAULT_BYOC_CACHE_MACHINE,
	};
};

const resizeStackAtom = ({
	ctx,
	deploymentGroupId,
	machine,
}: {
	ctx: StackContext;
	deploymentGroupId: string;
	machine: ByocCacheMachine;
}): Promise<void> => {
	ctx.machineById.set(deploymentGroupId, machine);
	return Promise.resolve();
};

const deleteStackAtom = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: StackContext;
	deploymentGroupId: string;
}): Promise<void> => {
	await postToMultiTenantAtom({
		atom: ctx.atom,
		route: "atoms.delete",
		body: { id: deploymentGroupId },
	});
	ctx.machineById.delete(deploymentGroupId);
};

/** A dev stack runs one multi-tenant Atom process; every org's Atom is a token and a folder inside it. */
export const createStackAtomDeployer = ({
	atom,
}: {
	atom: MultiTenantAtomAddress;
}): AtomDeployer => {
	const ctx = { atom, machineById: new Map<string, ByocCacheMachine>() };
	return {
		start: (params) => startStackAtom({ ctx, ...params }),
		find: (params) => findStackAtom({ ctx, ...params }),
		resize: (params) => resizeStackAtom({ ctx, ...params }),
		delete: (params) => deleteStackAtom({ ctx, ...params }),
	};
};
