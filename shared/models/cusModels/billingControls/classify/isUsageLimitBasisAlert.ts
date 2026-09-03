import type { DbUsageAlertLike } from "../usageAlert.js";

export const isUsageLimitBasisAlert = (alert: DbUsageAlertLike): boolean =>
	alert.basis === "usage_limit";
