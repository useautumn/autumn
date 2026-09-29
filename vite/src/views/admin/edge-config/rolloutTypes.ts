export type RolloutPercent = {
	percent: number;
	previousPercent: number;
	changedAt: number;
};

export type RolloutEntry = RolloutPercent & {
	orgs: Record<string, RolloutPercent>;
};

export type RolloutOrg = {
	id: string;
	name: string;
	slug: string;
};

export type RolloutsResponse = {
	activeRolloutId: string;
	settleMs: number;
	rollouts: Record<string, RolloutEntry>;
	orgsById: Record<string, RolloutOrg>;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const NO_ROLLOUT: RolloutPercent = {
	percent: 0,
	previousPercent: 0,
	changedAt: 0,
};

export const PERCENT_PRESETS = [0, 5, 10, 25, 50, 100] as const;

export const isValidPercent = (percent: number) =>
	Number.isInteger(percent) && percent >= 0 && percent <= 100;
