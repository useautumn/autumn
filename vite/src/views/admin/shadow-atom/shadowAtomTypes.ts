import type { RolloutOrg } from "../edge-config/rolloutTypes";

/** `GET /admin/shadow-atom-config`: one config for both envs, no token, encrypted or not. */
export type ShadowAtomConfigView = {
	endpointUrl: string | null;
	hasAdminToken: boolean;
	/** A registered org and the share of its customers the shadow Atom holds. */
	orgs: Record<string, { registeredAt: number; percent: number }>;
};

/** Registered orgs' names, from `GET /admin/shadow-atom-config/names`. */
export type ShadowAtomNames = { orgsById: Record<string, RolloutOrg> };
