import { createHash } from "node:crypto";
import { toDeploymentGroupName } from "@autumn/alien";
import type { AtomAccess } from "@autumn/billing";
import { SHADOW_ATOM_EXTERNAL_ID } from "@autumn/edge-config";
import {
	type ApiAtomAccess,
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

/** A dev stack's name goes in front, so two worktrees can hold the same org on alien at once; only `scripts/dev.ts` sets it. */
const cacheNamePrefix = (): string | null =>
	process.env.ATOM_DEPLOYMENT_PREFIX?.trim() || null;

/** What alien accepts as a deployment group's external id. */
const ALIEN_EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

/** Joins an external id from its parts and refuses one alien would reject, so a bad id fails here and not as a 503. */
export const toAlienExternalId = ({ parts }: { parts: string[] }): string => {
	const externalId = [cacheNamePrefix(), ...parts].filter(Boolean).join(".");
	if (!ALIEN_EXTERNAL_ID.test(externalId))
		throw new Error(`"${externalId}" is not a valid alien external id`);
	return externalId;
};

/** Whose Atoms these are: an org's env, or our shadow Atom. Its parts start every Atom's external id, and its base every default stack name. */
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

/** An org's external id always holds `.<env>` after its id, so no org's Atom can take the shadow Atom's group. */
export const SHADOW_ATOM_OWNER: AtomOwner = {
	idParts: [SHADOW_ATOM_EXTERNAL_ID],
	stackNameBase: "atom-shadow",
};

/** One Atom, as its deployer knows it: one deployment group each, so an Atom being removed never shares a group with its replacement. Records from before Atom ids keep the owner's bare id. */
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

/** The id the owner's next Atom takes, fixed by the Atoms it has, so the page can show its stack name before it exists. */
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

/** Six hex chars of the external id, so every Atom, and every dev stack, names its stack apart. */
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

/** The stack's name in the owner's cloud, which is also its deployment group's: the chosen base, or the owner's, then the suffix. */
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

/** The stack name the owner's next Atom takes, and the suffix Autumn adds to a name the org picks for it. */
export const nextAtomStackName = ({
	owner,
	existingAtomIds,
}: {
	owner: AtomOwner;
	existingAtomIds: string[];
}) => {
	const atomId = nextAtomId({ owner, existingAtomIds });
	return {
		stackName: atomStackName({ owner, atomId }),
		suffix: atomStackNameSuffix({ owner, atomId }),
	};
};

/** An Atom's names, as its deployer starts it. */
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

/** The label records made before stack names could be chosen were set up under. */
export const cacheGroupLabel = ({
	org,
	env,
}: {
	org: Pick<Organization, "slug">;
	env: AppEnv;
}) =>
	[cacheNamePrefix(), "autumn-byoc", org.slug, env].filter(Boolean).join("-");

/** A record from before stack names were stored keeps the name it was set up under. */
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

/** The names our shadow Atom was set up under before it took Atom ids like an org's. */
export const legacyShadowAtomNames = () => ({
	externalId: atomExternalId({ owner: SHADOW_ATOM_OWNER }),
	label: [cacheNamePrefix(), SHADOW_ATOM_EXTERNAL_ID].filter(Boolean).join("-"),
});

/** Outlasts the few alien calls a setup makes; a crashed holder frees the env after this. */
export const CACHE_LOCK_TTL_MS = 30_000;

/** The request schemas only let offered pairs through, so a miss here is a contract bug. */
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

/** A resize moves a running cache; one still being set up takes its machine from `create_atom`. */
export const cacheNotRunning = () =>
	new RecaseError({
		message: "Atom is not running yet, so it cannot be resized.",
		code: ErrCode.ByocCacheNotReady,
		statusCode: 409,
	});

/** Setup finishes on the first checks, which only reach a connected Atom. */
export const cacheNotConnected = () =>
	new RecaseError({
		message: "Atom is not connected yet, so its setup cannot be finished.",
		code: ErrCode.ByocCacheNotReady,
		statusCode: 409,
	});

/** Only a deploy that stopped can be resumed. */
export const cacheNotFailed = () =>
	new RecaseError({
		message: "Atom's deploy has not failed, so there is nothing to retry.",
		code: ErrCode.InvalidRequest,
		statusCode: 409,
	});

/** With an id, one change per Atom at a time; without, one new Atom per env at a time, since each takes the next free id. */
export const cacheLockKey = ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}) =>
	[`lock:byoc-cache:${ctx.org.id}:${ctx.env}`, atomId]
		.filter(Boolean)
		.join(":");

export const atomIdRequired = () =>
	new RecaseError({
		message:
			"This environment has more than one Atom, so name the one you mean with atom_id.",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

export const atomNotFound = ({ atomId }: { atomId: string }) =>
	new RecaseError({
		message: `No Atom ${atomId} in this environment.`,
		code: ErrCode.InvalidRequest,
		statusCode: 404,
	});

/** Why a new Atom is refused, in the words the org sees. */
export const atomCreateRefused = ({ access }: { access: AtomAccess }) =>
	access.reason === "not_on_plan"
		? new RecaseError({
				message:
					"Atom isn't included in your plan. Contact hey@useautumn.com to enable it.",
				code: ErrCode.FeatureLimitReached,
				statusCode: 403,
			})
		: new RecaseError({
				message: `This environment already runs ${access.limit} Atoms. Delete one to create another.`,
				code: ErrCode.InvalidRequest,
				statusCode: 409,
			});

export const atomAccessToApi = ({
	access,
}: {
	access: AtomAccess;
}): ApiAtomAccess => ({
	included: access.included,
	limit: access.limit,
	used: access.used,
	can_create: access.canCreate,
	reason: access.reason,
});
export const cacheDeploymentToApiCache = ({
	cacheDeployment,
	org,
}: {
	cacheDeployment: ByocCacheDeployment;
	org: Pick<Organization, "slug">;
}): ApiByocCache => ({
	id: cacheDeployment.id,
	env: cacheDeployment.env,
	name: cacheDeployment.name,
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

/** Only a create hands out the token, so reading a cache never reveals it. */
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
