import type { Feature, FullCustomer, FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { measureUsageAlert } from "./measure/measureUsageAlert.js";
import { resolveScopeApiBalances } from "./measure/resolveScopeApiBalances.js";
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
	const alertScopes = resolveAlertScopes({
		ctx,
		fullCustomer: tracked.after.fullCustomer,
		feature,
		entityId,
	});

	for (const scopedAlerts of alertScopes) {
		const alerts = scopedAlerts.alerts.filter((alert) => alert.enabled);
		if (alerts.length === 0) continue;

		const apiBalances = resolveScopeApiBalances({
			ctx,
			tracked,
			feature,
			entityId: scopedAlerts.entityId,
		});

		for (const alert of alerts) {
			const measured = measureUsageAlert({
				ctx,
				alert,
				feature,
				tracked,
				apiBalances,
				entityId: scopedAlerts.entityId,
			});
			if (!measured || !wasThresholdCrossed({ alert, ...measured })) continue;

			await sendUsageAlertWebhook({
				ctx,
				fullCustomer: tracked.after.fullCustomer,
				feature,
				alert,
				scope: scopedAlerts.scope,
				entityId: scopedAlerts.entityId,
				measurement: measured.after,
			});
		}
	}
};
