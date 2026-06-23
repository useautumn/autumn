import { jsonb } from "drizzle-orm/pg-core";
import type {
	AutoTopup,
	DbOverageAllowed,
	DbSpendLimit,
	DbUsageAlert,
	DbUsageLimit,
} from "./customerBillingControls.js";

export const billingControlColumns = () => ({
	auto_topups: jsonb().$type<AutoTopup[]>(),
	spend_limits: jsonb().$type<DbSpendLimit[]>(),
	usage_limits: jsonb().$type<DbUsageLimit[]>(),
	usage_alerts: jsonb().$type<DbUsageAlert[]>(),
	overage_allowed: jsonb().$type<DbOverageAllowed[]>(),
});
