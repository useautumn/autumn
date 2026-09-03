import { type DbUsageAlertLike, isUsageLimitBasisAlert } from "@autumn/shared";

export const writesUsageLimitAlert = (
	usageAlerts: DbUsageAlertLike[] | null | undefined,
): usageAlerts is DbUsageAlertLike[] =>
	(usageAlerts ?? []).some(isUsageLimitBasisAlert);
