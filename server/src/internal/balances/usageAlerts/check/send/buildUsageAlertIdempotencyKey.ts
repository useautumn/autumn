import { type DbUsageAlert, type Feature, usageLimitFilterKey } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AlertScope } from "../types/alertScope.js";

const ONE_MINUTE_MS = 60_000;

/** One send per alert identity per period per minute; the period keeps windowed alerts re-firing each window. */
export const buildUsageAlertIdempotencyKey = ({
	ctx,
	customerId,
	entityId,
	scope,
	feature,
	alert,
	periodStartAt,
	now,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	scope: AlertScope;
	feature: Feature;
	alert: DbUsageAlert;
	periodStartAt: number | null;
	now: number;
}): string =>
	[
		ctx.org.id,
		ctx.env,
		customerId,
		entityId ?? "_",
		scope,
		feature.id,
		alert.basis ?? "balance",
		usageLimitFilterKey(alert.filter) || "_",
		alert.threshold_type,
		alert.threshold,
		periodStartAt ?? "_",
		Math.floor(now / ONE_MINUTE_MS),
	].join(":");
