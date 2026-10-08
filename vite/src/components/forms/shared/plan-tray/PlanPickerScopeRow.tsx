import type { Entity } from "@autumn/shared";
import { useState } from "react";
import { PlanEntityScopeSelector } from "@/components/forms/shared/PlanEntityScopeSelector";
import { entityKey } from "@/components/forms/shared/utils/entityKey";
import {
	CUSTOMER_LEVEL_LABEL,
	scopeLabel,
} from "@/components/forms/shared/utils/scopeLabel";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { MoreEntitiesButton } from "./MoreEntitiesButton";
import { ScopeTab } from "./ScopeTab";

const INLINE_ENTITY_COUNT = 3;

/** Picks the scope a new plan is added under, from inside the plan picker. */
export function PlanPickerScopeRow({
	value,
	onChange,
}: {
	value: string | null;
	onChange: (entityId: string | null) => void;
}) {
	const [isMoreOpen, setIsMoreOpen] = useState(false);
	const selectedEntityId = value ?? undefined;
	const entitySearch = useScopeEntitySearch({ selectedEntityId });
	const { knownEntities } = entitySearch;

	if (!entitySearch.hasEntities) return null;

	const isSelected = (entity: Entity) => entityKey(entity) === value;
	const inlineEntities = knownEntities.slice(0, INLINE_ENTITY_COUNT);
	const selectedOutsideInline = inlineEntities.some(isSelected)
		? undefined
		: (knownEntities.find(isSelected) ?? entitySearch.selectedEntity);
	const tabEntities = selectedOutsideInline
		? [...inlineEntities, selectedOutsideInline]
		: inlineEntities;
	const hiddenCount = knownEntities.filter(
		(entity) =>
			!tabEntities.some((tab) => entityKey(tab) === entityKey(entity)),
	).length;

	return (
		<div className="flex items-center gap-1 overflow-hidden border-b border-border/50 px-2 py-1">
			<span className="shrink-0 px-1 text-[11px] font-medium text-subtle">
				For
			</span>
			<ScopeTab
				label={CUSTOMER_LEVEL_LABEL}
				isActive={value === null}
				onClick={() => onChange(null)}
			/>
			{tabEntities.map((entity) => (
				<ScopeTab
					key={entityKey(entity)}
					label={scopeLabel({ entityId: entityKey(entity), entity })}
					isActive={entityKey(entity) === value}
					onClick={() => onChange(entityKey(entity))}
				/>
			))}
			<span className="flex-1" />
			{hiddenCount > 0 && (
				<PlanEntityScopeSelector
					entities={entitySearch.entities}
					isLoading={entitySearch.isLoading}
					onChange={(entityId) => {
						onChange(entityId ?? null);
						setIsMoreOpen(false);
					}}
					onOpenChange={setIsMoreOpen}
					onSearchChange={entitySearch.setSearch}
					open={isMoreOpen}
					trigger={<MoreEntitiesButton count={hiddenCount} />}
					value={value}
				/>
			)}
		</div>
	);
}
