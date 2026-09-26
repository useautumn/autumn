import {
	type ApiUsageLimit,
	billingControlsFromColumns,
	type DbUsageLimit,
	type Entity,
	type Feature,
	type FullCustomer,
} from "@autumn/shared";
import { useMemo } from "react";
import { resolveDisplayedBillingControls } from "@/components/billing-controls/resolveDisplayedBillingControls";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "../customer/CustomerContext";
import { decoratePlanUsageLimits } from "./decoratePlanUsageLimits";

/** Billing controls that apply to the customer or selected entity, tagged by origin. */
export const useDisplayedBillingControls = () => {
	const { customer, features, isLoading, refetch } = useCusQuery();
	const { entityId } = useCustomerContext();
	const fullCustomer = customer as FullCustomer | undefined;

	const selectedEntity = useMemo(() => {
		if (!entityId) return null;
		return (
			fullCustomer?.entities.find(
				(entity: Entity) =>
					entity.id === entityId || entity.internal_id === entityId,
			) ?? null
		);
	}, [entityId, fullCustomer?.entities]);

	const featureNameById = useMemo(
		() =>
			new Map(
				(features ?? []).map((feature: Feature) => [feature.id, feature.name]),
			),
		[features],
	);

	const displayed = useMemo(() => {
		const resolved = resolveDisplayedBillingControls({
			ownControls: billingControlsFromColumns(selectedEntity ?? fullCustomer),
			customerControls: selectedEntity
				? billingControlsFromColumns(fullCustomer)
				: undefined,
			// Match the server: a subject's plans are customer-level plus its own entity plans.
			customerProducts: (fullCustomer?.customer_products ?? []).filter(
				(customerProduct) =>
					!customerProduct.internal_entity_id ||
					customerProduct.internal_entity_id === selectedEntity?.internal_id,
			),
		});

		const usageLimitOrigins = resolved.origins.usage_limits ?? [];
		const usageLimits = resolved.billingControls.usage_limits?.map(
			(usageLimit, index): ApiUsageLimit | DbUsageLimit =>
				usageLimitOrigins[index]?.type === "plan" && !selectedEntity
					? decoratePlanUsageLimits({
							planUsageLimits: [usageLimit as DbUsageLimit],
							decoratedPlanUsageLimits: fullCustomer?.plan_usage_limits,
						})[0]
					: usageLimit,
		);

		return {
			origins: resolved.origins,
			billingControls: {
				...resolved.billingControls,
				...(usageLimits && { usage_limits: usageLimits }),
			},
		};
	}, [selectedEntity, fullCustomer]);

	return {
		...displayed,
		fullCustomer,
		selectedEntity,
		featureNameById,
		isLoading,
		refetch,
	};
};
