import type { ByocCacheStatus } from "@autumn/shared";
import type { RolloutOrg } from "../edge-config/rolloutTypes";

export const SHADOW_ATOM_ENVS = ["sandbox", "live"] as const;
export type ShadowAtomEnv = (typeof SHADOW_ATOM_ENVS)[number];

/** One env as `GET /admin/shadow-atom-config` returns it: no token, encrypted or not. */
export type ShadowAtomEnvView = {
	endpointUrl: string | null;
	hasAdminToken: boolean;
	/** A registered org and the share of its customers the shadow Atom holds. */
	orgs: Record<string, { registeredAt: number; percent: number }>;
};

export type ShadowAtomConfigView = Record<ShadowAtomEnv, ShadowAtomEnvView>;

export type ShadowAtomMachine = { cpu: number; memory: number };

export type ShadowAtomDeployment = {
	deployment_group_id: string;
	status: ByocCacheStatus;
	endpoint_url: string | null;
	machine: ShadowAtomMachine | null;
};

/** What a create hands back once: the admin token's hash and, on hosted alien, the setup link. */
export type ShadowAtomCreated = {
	adminTokenHash: string;
	setupUrl: string | null;
};

/** Registered orgs' names, from `GET /admin/shadow-atom-config/:env/names`. */
export type ShadowAtomNames = { orgsById: Record<string, RolloutOrg> };
