import type { Feature, FullCustomer, FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { measureUsageAlert } from "./measure/measureUsageAlert.js";
import { resolveScopeApiBalances } from "./measure/resolveScopeApiBalances.js";
import { filterEnabledUsageAlertsForFeature } from "./resolve/filterEnabledUsageAlertsForFeature.js";
import { resolveCustomerScopeAlerts } from "./resolve/resolveCustomerScopeAlerts.js";
import { resolveEntityScopeAlerts } from "./resolve/resolveEntityScopeAlerts.js";
import { resolveOrgScopeAlerts } from "./resolve/resolveOrgScopeAlerts.js";
import { sendUsageAlertWebhook } from "./send/sendUsageAlertWebhook.js";
import type { ScopedUsageAlerts } from "./types/scopedUsageAlerts.js";
import { wasThresholdCrossed } from "./wasThresholdCrossed.js";

export const checkUsageAlerts = async ({
	ctx,
	oldFullCus,
	newFullCus,
	oldFullSubject,
	newFullSubject,
	feature,
	entityId,
	now = Date.now(),
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	oldFullSubject?: FullSubject;
	newFullSubject?: FullSubject;
	feature: Feature;
	entityId?: string;
	now?: number;
}): Promise<void> => {
	const scopes: ScopedUsageAlerts[] = [
		resolveCustomerScopeAlerts({ fullCustomer: newFullCus, feature }),
		...(entityId
			? [resolveEntityScopeAlerts({ fullCustomer: newFullCus, feature, entityId })]
			: []),
		resolveOrgScopeAlerts({ ctx, feature, entityId }),
	];

	for (const scoped of scopes) {
		const alerts = filterEnabledUsageAlertsForFeature({ alerts: scoped.alerts, feature });
		if (alerts.length === 0) continue;

		const apiBalances = resolveScopeApiBalances({
			ctx,
			oldFullCus,
			newFullCus,
			feature,
			entityId: scoped.entityId,
		});

		for (const alert of alerts) {
			const measured = measureUsageAlert({
				ctx,
				alert,
				feature,
				apiBalances,
				oldFullSubject,
				newFullSubject,
				now,
			});
			if (!measured || !wasThresholdCrossed({ alert, ...measured })) continue;

			await sendUsageAlertWebhook({
				ctx,
				fullCustomer: newFullCus,
				feature,
				alert,
				scope: scoped.scope,
				entityId: scoped.entityId,
				measurement: measured.after,
				now,
			});
		}
	}
};
