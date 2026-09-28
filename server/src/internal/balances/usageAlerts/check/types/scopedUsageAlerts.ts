import type { DbUsageAlert } from "@autumn/shared";
import type { AlertScope } from "./alertScope.js";

export type ScopedUsageAlerts = {
	scope: AlertScope;
	alerts: DbUsageAlert[];
	entityId?: string;
};
