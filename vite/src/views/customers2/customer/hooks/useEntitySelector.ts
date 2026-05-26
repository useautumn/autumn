import type { Entity, Feature, FullCustomer } from "@autumn/shared";
import { FeatureUsageType, getFeatureName } from "@autumn/shared";
import { useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useDebounce } from "@/hooks/useDebounce";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useEntitiesQuery } from "./useEntitiesQuery";

const PLACEHOLDER = "PENDING";

const getEntityValue = (entity: Entity): string =>
	entity.id || entity.internal_id;

const getEntityLabel = (entity: Entity): string =>
	entity.name || entity.id || PLACEHOLDER;

const deriveEntityTypeText = ({
	totalCount,
	entities,
	features,
}: {
	totalCount: number;
	entities: Entity[];
	features: Feature[];
}): string => {
	if (totalCount === 0) return "entities";

	const firstFeatureId = entities[0]?.feature_id;
	const allSameType =
		firstFeatureId &&
		entities.every((e) => e.feature_id === firstFeatureId);

	if (allSameType && firstFeatureId) {
		const feature = features.find((f) => f.id === firstFeatureId);
		if (feature) return getFeatureName({ feature, units: totalCount });
	}

	return totalCount === 1 ? "entity" : "entities";
};

export const useEntitySelector = () => {
	const [search, setSearch] = useState("");
	const { entityId, setEntityId } = useEntity();
	const { features } = useFeaturesQuery();
	const { customer } = useCusQuery();

	const customerEntities = (customer as FullCustomer)?.entities ?? [];
	const hasEntities = customerEntities.length > 0;

	const hasContinuousUseFeatures = features?.some(
		(f: Feature) => f.config?.usage_type === FeatureUsageType.Continuous,
	);

	const isVisible = hasContinuousUseFeatures && hasEntities;

	const debouncedSearch = useDebounce({ value: search, delayMs: 300 });
	const {
		entities,
		totalCount,
		isLoading,
		refetch,
	} = useEntitiesQuery({
		search: debouncedSearch || undefined,
		enabled: isVisible,
	});

	const selectedEntity =
		entities.find((e) => e.id === entityId || e.internal_id === entityId) ??
		customerEntities.find((e) => e.id === entityId || e.internal_id === entityId);

	const effectiveTotalCount = totalCount ?? customerEntities.length;

	const entityTypeText = deriveEntityTypeText({
		totalCount: effectiveTotalCount,
		entities: entities.length > 0 ? entities : customerEntities,
		features: features ?? [],
	});

	return {
		entities,
		selectedEntity,
		entityId,
		totalCount: effectiveTotalCount,
		entityTypeText,
		isLoading,
		isVisible,
		setEntityId,
		setSearch,
		refetch,
		getEntityValue,
		getEntityLabel,
	};
};
