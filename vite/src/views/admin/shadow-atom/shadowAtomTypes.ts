import type { ByocCacheStatus } from "@autumn/shared";
import type { RolloutPercent } from "../edge-config/rolloutTypes";

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

export const SHADOW_ATOM_RESULT_RANGES = ["1h", "24h"] as const;
export type ShadowAtomResultRange = (typeof SHADOW_ATOM_RESULT_RANGES)[number];

export type ShadowAtomOrgResult = {
	org_id: string;
	checks: number;
	matches: number;
	mismatches: number;
	timeouts: number;
	errors: number;
	match_rate: number | null;
	p50_ms: number;
	p99_ms: number;
};

export type ShadowAtomResults = {
	available: boolean;
	range: ShadowAtomResultRange;
	orgs: ShadowAtomOrgResult[];
};
