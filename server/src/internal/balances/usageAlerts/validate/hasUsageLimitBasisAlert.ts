import { type DbUsageAlertLike, isUsageLimitBasisAlert } from "@autumn/shared";

export const hasUsageLimitBasisAlert = (
	usageAlerts: DbUsageAlertLike[] | null | undefined,
): usageAlerts is DbUsageAlertLike[] =>
	(usageAlerts ?? []).some(isUsageLimitBasisAlert);
