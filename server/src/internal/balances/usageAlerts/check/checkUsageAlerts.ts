import type { Feature, FullCustomer, FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { measureUsageAlert } from "./measure/measureUsageAlert.js";
import { resolveScopeApiBalances } from "./measure/resolveScopeApiBalances.js";
import { filterEnabledUsageAlertsForFeature } from "./resolve/filterEnabledUsageAlertsForFeature.js";
import { resolveAlertScopes } from "./resolve/resolveAlertScopes.js";
import { sendUsageAlertWebhook } from "./send/sendUsageAlertWebhook.js";
import type { TrackedSubjects } from "./types/trackedSubjects.js";
import { wasThresholdCrossed } from "./wasThresholdCrossed.js";

export const checkUsageAlerts = async ({
	ctx,
	oldFullCus,
	newFullCus,
	oldFullSubject,
	newFullSubject,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	oldFullSubject?: FullSubject;
	newFullSubject?: FullSubject;
	feature: Feature;
	entityId?: string;
}): Promise<void> => {
	const tracked: TrackedSubjects = {
		before: { fullCustomer: oldFullCus, fullSubject: oldFullSubject },
		after: { fullCustomer: newFullCus, fullSubject: newFullSubject },
	};
	const scopes = resolveAlertScopes({
		ctx,
		fullCustomer: tracked.after.fullCustomer,
		feature,
		entityId,
	});

	for (const scoped of scopes) {
		const alerts = filterEnabledUsageAlertsForFeature({
			alerts: scoped.alerts,
			feature,
		});
		if (alerts.length === 0) continue;

		const apiBalances = resolveScopeApiBalances({
			ctx,
			tracked,
			feature,
			entityId: scoped.entityId,
		});

		for (const alert of alerts) {
			const measured = measureUsageAlert({
				ctx,
				alert,
				feature,
				tracked,
				apiBalances,
			});
			if (!measured || !wasThresholdCrossed({ alert, ...measured })) continue;

			await sendUsageAlertWebhook({
				ctx,
				fullCustomer: tracked.after.fullCustomer,
				feature,
				alert,
				scope: scoped.scope,
				entityId: scoped.entityId,
				measurement: measured.after,
			});
		}
	}
};
