import { AppEnv, type Feature } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ScopedUsageAlerts } from "../types/scopedUsageAlerts.js";
import { filterUsageAlertsForFeature } from "./filterEnabledUsageAlertsForFeature.js";

// Org alerts measure the tracked subject, entity included.
export const resolveOrgScopeAlerts = ({
	ctx,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	feature: Feature;
	entityId?: string;
}): ScopedUsageAlerts => {
	const orgAlerts =
		ctx.env === AppEnv.Sandbox
			? (ctx.org.config?.sandbox_usage_alerts ?? [])
			: (ctx.org.config?.usage_alerts ?? []);
	return {
		scope: "org",
		entityId,
		alerts: filterUsageAlertsForFeature({ alerts: orgAlerts, feature }),
	};
};
