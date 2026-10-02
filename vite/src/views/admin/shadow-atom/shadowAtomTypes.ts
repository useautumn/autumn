import type { ByocCacheStatus } from "@autumn/shared";
import type {
	RolloutCustomerName,
	RolloutOrg,
	RolloutPercent,
} from "../edge-config/rolloutTypes";

export const SHADOW_ATOM_ENVS = ["sandbox", "live"] as const;
export type ShadowAtomEnv = (typeof SHADOW_ATOM_ENVS)[number];

/** Mirrors the server's `SHADOW_ATOM_SETTLE_MS`: 15s in production builds, 5s locally. */
export const SHADOW_ATOM_SETTLE_MS = import.meta.env.PROD ? 15_000 : 5_000;

export type ShadowAtomRollout = RolloutPercent & {
	orgs: Record<string, number>;
	customers: Record<string, Record<string, boolean>>;
};

/** One env as `GET /admin/shadow-atom-config` returns it: no token, encrypted or not. */
export type ShadowAtomEnvView = {
	endpointUrl: string | null;
	rollout: ShadowAtomRollout;
	hasAdminToken: boolean;
	orgs: Record<string, { registeredAt: number }>;
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

/** Names for the ids the env's config holds, from `GET /admin/shadow-atom-config/:env/names`. */
export type ShadowAtomNames = {
	orgsById: Record<string, RolloutOrg>;
	customerNamesByOrgId: Record<string, Record<string, RolloutCustomerName>>;
};
