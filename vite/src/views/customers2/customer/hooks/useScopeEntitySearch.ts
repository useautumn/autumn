import type { Entity, FullCustomer } from "@autumn/shared";
import { useEffect, useState } from "react";
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

	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce({ value: search, delayMs: 300 });
	const {
		entities: allEntities,
		totalCount,
		isLoading: isLoadingAll,
	} = useEntitiesQuery();
	const { entities: searchedEntities, isLoading: isLoadingSearch } =
		useEntitiesQuery({
			search: debouncedSearch,
			enabled: !!debouncedSearch,
		});
	const [searchedSelection, setSearchedSelection] = useState<Entity>();
	const allKnownEntities = [
		...new Map(
			[...allEntities, ...customerEntities].map((entity) => [
				entityKey(entity),
				entity,
			]),
		).values(),
	];
	const hasEntities = allKnownEntities.length > 0 || totalCount > 0;
	const visibleEntities = debouncedSearch ? searchedEntities : allKnownEntities;

	const currentSelection = [...searchedEntities, ...allKnownEntities].find(
		(e) => e.id === selectedEntityId || e.internal_id === selectedEntityId,
	);
	useEffect(() => {
		if (currentSelection) setSearchedSelection(currentSelection);
	}, [currentSelection]);
	const selectedEntity =
		currentSelection ??
		(searchedSelection &&
		(searchedSelection.id === selectedEntityId ||
			searchedSelection.internal_id === selectedEntityId)
			? searchedSelection
			: undefined);

	const entities =
		selectedEntity &&
		!visibleEntities.some((e) => entityKey(e) === entityKey(selectedEntity))
			? [selectedEntity, ...visibleEntities]
			: visibleEntities;

	return {
		hasEntities,
		entities,
		selectedEntity,
		isLoading: isLoadingAll || (!!debouncedSearch && isLoadingSearch),
		setSearch,
	};
};
