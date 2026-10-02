import type { ByocCacheStatus } from "@autumn/shared";
import type { RolloutOrg } from "../edge-config/rolloutTypes";

/** `GET /admin/shadow-atom-config`: one config for both envs, no token, encrypted or not. */
export type ShadowAtomConfigView = {
	endpointUrl: string | null;
	hasAdminToken: boolean;
	/** A registered org and the share of its customers the shadow Atom holds. */
	orgs: Record<string, { registeredAt: number; percent: number }>;
};

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

/** Registered orgs' names, from `GET /admin/shadow-atom-config/names`. */
export type ShadowAtomNames = { orgsById: Record<string, RolloutOrg> };
