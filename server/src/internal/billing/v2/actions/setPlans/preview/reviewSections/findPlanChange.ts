import type { CustomerPlanChange } from "@autumn/shared";

export const findPlanChange = ({
	planChanges,
	planId,
	entityId,
}: {
	planChanges: CustomerPlanChange[];
	planId: string;
	entityId: string | null;
}) =>
	planChanges.find(
		(change) =>
			(change.subscription?.plan_id ?? change.purchase?.plan_id) === planId &&
			(change.entity_id ?? null) === entityId,
	);
