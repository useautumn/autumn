import type { EntInterval } from "../productModels/intervals/entitlementInterval.js";
import type { PooledBalanceResetMode } from "./pooledBalanceTable.js";

export type PooledBalanceIdentity = {
	internalFeatureId: string;
	interval: EntInterval;
	intervalCount: number;
	resetCycleAnchor: number | null;
	resetMode: PooledBalanceResetMode;
	stripeSubscriptionId: string | null;
	customerLicenseLinkId: string | null;
	rolloverSignature: string;
};
