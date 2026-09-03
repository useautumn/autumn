import type { Feature, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ScopedUsageAlerts } from "../types/scopedUsageAlerts.js";
import { resolveCustomerScopeAlerts } from "./resolveCustomerScopeAlerts.js";
import { resolveEntityScopeAlerts } from "./resolveEntityScopeAlerts.js";
import { resolveOrgScopeAlerts } from "./resolveOrgScopeAlerts.js";

export const resolveAlertScopes = ({
	ctx,
	fullCustomer,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	feature: Feature;
	entityId?: string;
}): ScopedUsageAlerts[] => [
	resolveCustomerScopeAlerts({ fullCustomer, feature }),
	...(entityId
		? [resolveEntityScopeAlerts({ fullCustomer, feature, entityId })]
		: []),
	resolveOrgScopeAlerts({ ctx, feature, entityId }),
];
