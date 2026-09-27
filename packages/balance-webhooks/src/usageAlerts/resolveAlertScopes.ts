import type { CheckCommand, WorkerFullSubject } from "@autumn/balance-engine";
import {
	AppEnv,
	type DbUsageAlert,
	type Feature,
	getPlanBillingControlProducts,
} from "@autumn/shared";
import type { ScopedUsageAlerts } from "./types/usageAlert.js";

export const filterUsageAlertsForFeature = ({
	alerts,
	feature,
}: {
	alerts: DbUsageAlert[];
	feature: Feature;
}): DbUsageAlert[] =>
	alerts.filter(
		(alert) => alert.feature_id === feature.id || !alert.feature_id,
	);

// Plan alerts are a fallback at customer scope, used only when the customer has none for the feature.
const resolveCustomerScopeAlerts = ({
	fullSubject,
	feature,
	now,
}: {
	fullSubject: WorkerFullSubject;
	feature: Feature;
	now: number;
}): ScopedUsageAlerts => {
	const customerAlerts = filterUsageAlertsForFeature({
		alerts: fullSubject.customer.usage_alerts ?? [],
		feature,
	});
	if (customerAlerts.length > 0) {
		return { scope: "customer", alerts: customerAlerts };
	}

	// A license link's product is its parent's plan, never a plan of its own; an entity's plan still counts.
	const planProducts = fullSubject.customer_products.filter(
		(customerProduct) =>
			customerProduct.customer_license_link_id == null ||
			customerProduct.internal_entity_id == null,
	);
	const planProduct = getPlanBillingControlProducts({
		customerProducts: planProducts,
		now,
	}).find(
		(customerProduct) =>
			filterUsageAlertsForFeature({
				alerts: customerProduct.product?.usage_alerts ?? [],
				feature,
			}).length > 0,
	);
	return {
		scope: "plan",
		alerts: filterUsageAlertsForFeature({
			alerts: planProduct?.product?.usage_alerts ?? [],
			feature,
		}),
	};
};

const resolveEntityScopeAlerts = ({
	fullSubject,
	feature,
	entityId,
}: {
	fullSubject: WorkerFullSubject;
	feature: Feature;
	entityId: string;
}): ScopedUsageAlerts => {
	const entity =
		fullSubject.entity?.id === entityId ? fullSubject.entity : null;
	return {
		scope: "entity",
		entityId,
		alerts: filterUsageAlertsForFeature({
			alerts: entity?.usage_alerts ?? [],
			feature,
		}),
	};
};

// Org alerts measure the tracked subject, entity included.
const resolveOrgScopeAlerts = ({
	command,
	feature,
	entityId,
}: {
	command: CheckCommand;
	feature: Feature;
	entityId?: string;
}): ScopedUsageAlerts => {
	const orgAlerts =
		command.identity.env === AppEnv.Sandbox
			? (command.org.config.sandbox_usage_alerts ?? [])
			: (command.org.config.usage_alerts ?? []);
	return {
		scope: "org",
		entityId,
		alerts: filterUsageAlertsForFeature({ alerts: orgAlerts, feature }),
	};
};

/** Customer (or its plan) first, then the tracked entity's own, then the org's: each measured on its own balance. */
export const resolveAlertScopes = ({
	command,
	fullSubject,
	feature,
}: {
	command: CheckCommand;
	fullSubject: WorkerFullSubject;
	feature: Feature;
}): ScopedUsageAlerts[] => {
	const entityId = command.identity.entityId ?? undefined;
	return [
		resolveCustomerScopeAlerts({
			fullSubject,
			feature,
			now: command.occurredAt,
		}),
		...(entityId
			? [resolveEntityScopeAlerts({ fullSubject, feature, entityId })]
			: []),
		resolveOrgScopeAlerts({ command, feature, entityId }),
	];
};
