import type { CheckCommand, WorkerFullSubject } from "@autumn/balance-engine";
import { findFeatureOnSubject } from "../common/findSubject/findFeatureOnSubject.js";
import type { BalanceWebhook } from "../types/balanceWebhook.js";
import { resolveScopeApiBalances } from "./measure/measureBalanceBasis.js";
import { measureUsageAlert } from "./measure/measureUsageAlert.js";
import { resolveAlertScopes } from "./resolveAlertScopes.js";
import { usageAlertToWebhook } from "./usageAlertToWebhook.js";
import { wasThresholdCrossed } from "./wasThresholdCrossed.js";

/** Every usage alert this mutation crossed, at each scope that carries one: what prod's checkUsageAlerts sends, decided from the log alone. */
export const checkUsageAlerts = ({
	command,
	before,
	after,
}: {
	command: CheckCommand;
	before: WorkerFullSubject;
	after: WorkerFullSubject;
}): BalanceWebhook[] => {
	const now = command.occurredAt;
	const feature = findFeatureOnSubject({
		fullSubject: after,
		featureId: command.featureId,
		now,
	});
	if (!feature) return [];

	const tracked = { before, after };
	const webhooks: BalanceWebhook[] = [];
	for (const scoped of resolveAlertScopes({
		command,
		fullSubject: after,
		feature,
	})) {
		const alerts = scoped.alerts.filter((alert) => alert.enabled);
		if (alerts.length === 0) continue;

		const apiBalances = resolveScopeApiBalances({
			tracked,
			feature,
			entityId: scoped.entityId,
			now,
		});

		for (const alert of alerts) {
			const measured = measureUsageAlert({
				command,
				alert,
				feature,
				tracked,
				apiBalances,
				entityId: scoped.entityId,
			});
			if (!measured || !wasThresholdCrossed({ alert, ...measured })) continue;

			webhooks.push(
				usageAlertToWebhook({
					command,
					feature,
					alert,
					scope: scoped.scope,
					entityId: scoped.entityId,
					measurement: measured.after,
				}),
			);
		}
	}
	return webhooks;
};
