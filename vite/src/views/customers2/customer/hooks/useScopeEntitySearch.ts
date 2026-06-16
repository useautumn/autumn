import type { Entity, FullCustomer } from "@autumn/shared";
import { useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useEntitiesQuery } from "./useEntitiesQuery";

const entityKey = (entity: Entity): string => entity.id || entity.internal_id;

type UseScopeEntitySearchResult = {
	hasEntities: boolean;
	entities: Entity[];
	selectedEntity: Entity | undefined;
	isLoading: boolean;
	setSearch: (search: string) => void;
};

export const useScopeEntitySearch = ({
	selectedEntityId,
}: {
	selectedEntityId: string | undefined;
}): UseScopeEntitySearchResult => {
	const { customer } = useCusQuery();
	const customerEntities = (customer as FullCustomer | null)?.entities ?? [];
	const hasEntities = customerEntities.length > 0;

	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce({ value: search, delayMs: 300 });
	const { entities: searchedEntities, isLoading } = useEntitiesQuery({
		search: debouncedSearch || undefined,
		enabled: hasEntities,
	});

	const selectedEntity = customerEntities.find(
		(e) => e.id === selectedEntityId || e.internal_id === selectedEntityId,
	);

	const entities =
		selectedEntity &&
		!searchedEntities.some((e) => entityKey(e) === entityKey(selectedEntity))
			? [selectedEntity, ...searchedEntities]
			: searchedEntities;

	return { hasEntities, entities, selectedEntity, isLoading, setSearch };
};
