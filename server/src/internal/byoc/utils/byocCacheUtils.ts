import { createHash } from "node:crypto";
import { toDeploymentGroupName } from "@autumn/alien";
import { SHADOW_ATOM_EXTERNAL_ID } from "@autumn/edge-config";
import {
	type ApiByocCache,
	type AppEnv,
	type ByocCacheDeployment,
	type ByocCacheMachine,
	type CreateByocCacheResponse,
	ErrCode,
	findByocCacheMachine,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentToAtomToken } from "./atomTokenUtils.js";

const cacheNamePrefix = (): string | null =>
	process.env.ATOM_DEPLOYMENT_PREFIX?.trim() || null;

const ALIEN_EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

export const toAlienExternalId = ({ parts }: { parts: string[] }): string => {
	const externalId = [cacheNamePrefix(), ...parts].filter(Boolean).join(".");
	if (!ALIEN_EXTERNAL_ID.test(externalId))
		throw new Error(`"${externalId}" is not a valid alien external id`);
	return externalId;
};

export type AtomOwner = { idParts: string[]; stackNameBase: string };

export const cacheOwner = ({
	org,
	env,
}: {
	org: Pick<Organization, "id" | "slug">;
	env: AppEnv;
}): AtomOwner => ({
	idParts: [org.id, env],
	stackNameBase: `atom-${org.slug}-${env}`,
});

export const SHADOW_ATOM_OWNER: AtomOwner = {
	idParts: [SHADOW_ATOM_EXTERNAL_ID],
	stackNameBase: "atom-shadow",
};

export const atomExternalId = ({
	owner,
	atomId,
}: {
	owner: AtomOwner;
	atomId?: string;
}) =>
	toAlienExternalId({
		parts: [...owner.idParts, atomId].filter((part) => part !== undefined),
	});

export const nextAtomId = ({
	owner,
	existingAtomIds,
}: {
	owner: AtomOwner;
	existingAtomIds: string[];
}) =>
	`atom_${createHash("sha256")
		.update([...owner.idParts, ...[...existingAtomIds].sort()].join("."))
		.digest("hex")
		.slice(0, 24)}`;

export const atomStackNameSuffix = ({
	owner,
	atomId,
}: {
	owner: AtomOwner;
	atomId?: string;
}) =>
	createHash("sha256")
		.update(atomExternalId({ owner, atomId }))
		.digest("hex")
		.slice(0, 6);

export const atomStackName = ({
	owner,
	atomId,
	base = owner.stackNameBase,
}: {
	owner: AtomOwner;
	atomId?: string;
	base?: string;
}) =>
	toDeploymentGroupName({
		label: [base, atomStackNameSuffix({ owner, atomId })].join("-"),
	});

export const atomNames = ({
	owner,
	atomId,
	stackName = atomStackName({ owner, atomId }),
}: {
	owner: AtomOwner;
	atomId?: string;
	stackName?: string;
}) => ({
	externalId: atomExternalId({ owner, atomId }),
	label: stackName,
});

export const cacheGroupLabel = ({
	org,
	env,
}: {
	org: Pick<Organization, "slug">;
	env: AppEnv;
}) =>
	[cacheNamePrefix(), "autumn-byoc", org.slug, env].filter(Boolean).join("-");

export const cacheDeploymentStackName = ({
	cacheDeployment,
	org,
}: {
	cacheDeployment: ByocCacheDeployment;
	org: Pick<Organization, "slug">;
}) =>
	cacheDeployment.stack_name ??
	toDeploymentGroupName({
		label: cacheGroupLabel({ org, env: cacheDeployment.env }),
	});

export const legacyShadowAtomNames = () => ({
	externalId: atomExternalId({ owner: SHADOW_ATOM_OWNER }),
	label: [cacheNamePrefix(), SHADOW_ATOM_EXTERNAL_ID].filter(Boolean).join("-"),
});

export const CACHE_LOCK_TTL_MS = 30_000;

export const resourcesToMachine = ({
	cpu,
	memory,
}: {
	cpu: number;
	memory: number;
}): ByocCacheMachine => {
	const machine = findByocCacheMachine({ cpu, memory });
	if (machine) return machine;
	throw new RecaseError({
		message: `No Atom machine has ${cpu} vCPU / ${memory} GiB`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

export const cacheDeploymentToMachine = ({
	cacheDeployment,
}: {
	cacheDeployment: ByocCacheDeployment;
}): ByocCacheMachine | null => {
	const { cpu, memory } = cacheDeployment;
	if (cpu === null || memory === null) return null;
	return findByocCacheMachine({ cpu, memory }) ?? null;
};

export const cacheNotRunning = () =>
	new RecaseError({
		message: "Atom is not running yet, so it cannot be resized.",
		code: ErrCode.ByocCacheNotReady,
		statusCode: 409,
	});

export const cacheNotConnected = () =>
	new RecaseError({
		message: "Atom is not connected yet, so its setup cannot be finished.",
		code: ErrCode.ByocCacheNotReady,
		statusCode: 409,
	});

export const cacheNotFailed = () =>
	new RecaseError({
		message: "Atom's deploy has not failed, so there is nothing to retry.",
		code: ErrCode.InvalidRequest,
		statusCode: 409,
	});

export const cacheLockKey = ({ ctx }: { ctx: AutumnContext }) =>
	`lock:byoc-cache:${ctx.org.id}:${ctx.env}`;

export const cacheDeploymentToApiCache = ({
	cacheDeployment,
	org,
}: {
	cacheDeployment: ByocCacheDeployment;
	org: Pick<Organization, "slug">;
}): ApiByocCache => ({
	id: cacheDeployment.id,
	env: cacheDeployment.env,
	stack_name: cacheDeploymentStackName({ cacheDeployment, org }),
	status: cacheDeployment.status,
	deployment_id: cacheDeployment.deployment_id,
	endpoint_url: cacheDeployment.endpoint_url,
	created_at: cacheDeployment.created_at,
	first_check_at: cacheDeployment.first_check_at,
	cpu: cacheDeployment.cpu,
	memory: cacheDeployment.memory,
	region: cacheDeployment.region,
	network: cacheDeployment.network,
	stages: cacheDeployment.stages,
	error: cacheDeployment.error,
});

export const cacheDeploymentToCreateResponse = ({
	cacheDeployment,
	org,
	setupUrl,
}: {
	cacheDeployment: ByocCacheDeployment;
	org: Pick<Organization, "slug">;
	setupUrl: string | null;
}): CreateByocCacheResponse => ({
	...cacheDeploymentToApiCache({ cacheDeployment, org }),
	setup_url: setupUrl,
	token: cacheDeploymentToAtomToken({ cacheDeployment }),
});
