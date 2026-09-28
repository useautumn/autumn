import {
	type DbUsageAlert,
	DEFAULT_USAGE_ALERT_BASIS,
	type Feature,
	ms,
	usageLimitFilterKey,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AlertScope } from "../types/alertScope.js";

// The period keeps windowed alerts re-firing each window.
export const buildUsageAlertIdempotencyKey = ({
	ctx,
	customerId,
	entityId,
	scope,
	feature,
	alert,
	periodStartAt,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	scope: AlertScope;
	feature: Feature;
	alert: DbUsageAlert;
	periodStartAt: number | null;
}): string =>
	[
		ctx.org.id,
		ctx.env,
		customerId,
		entityId ?? "_",
		scope,
		feature.id,
		alert.basis ?? DEFAULT_USAGE_ALERT_BASIS,
		usageLimitFilterKey(alert.filter) || "_",
		alert.threshold_type,
		alert.threshold,
		periodStartAt ?? "_",
		Math.floor(ctx.timestamp / ms.minutes(1)),
	].join(":");
