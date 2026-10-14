import type { RolloutOrg } from "../edge-config/rolloutTypes";

export type ShadowAtomConfigView = {
	endpointUrl: string | null;
	hasAdminToken: boolean;
	orgs: Record<string, { registeredAt: number; percent: number }>;
};

export type ShadowAtomNames = { orgsById: Record<string, RolloutOrg> };
