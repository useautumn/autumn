export type RolloutPercent = {
	percent: number;
	previousPercent: number;
	changedAt: number;
};

/** A customer pinned to the worker; `removedAt` is set once it has been removed. */
export type RolloutCustomer = {
	addedAt: number;
	removedAt?: number;
};

export type RolloutEntry = RolloutPercent & {
	orgs: Record<string, RolloutPercent>;
	customers?: Record<string, Record<string, RolloutCustomer>>;
};

export type RolloutCustomerName = {
	name: string | null;
	email: string | null;
};

/** A customer found by the admin search, or typed in by id when it does not exist yet. */
export type RolloutCustomerOption = RolloutCustomerName & { id: string };

export type RolloutCustomerPin = {
	orgId: string;
	customerId: string;
	customer: RolloutCustomer;
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
	customerNamesByOrgId: Record<string, Record<string, RolloutCustomerName>>;
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
