import type { Entity } from "@autumn/shared";
import { useState } from "react";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { PlanEntityScopeSelector } from "./PlanEntityScopeSelector";
import { PlanScopeChip } from "./PlanScopeChip";
import { PlanScopeMenuItems } from "./PlanScopeMenuItems";
import type { PlanRowScope } from "./ScopedPlanRow";
import { resolvePlanEntityId } from "./utils/resolvePlanEntityId";
import { scopeLabel } from "./utils/scopeLabel";

const explicitScopeLabel = ({
	planEntityId,
	selectedEntity,
}: {
	planEntityId: string | null | undefined;
	selectedEntity: Entity | undefined;
}): string | undefined => {
	if (planEntityId === undefined) return undefined;
	return scopeLabel({ entityId: planEntityId, entity: selectedEntity });
};

/**
 * Per-plan entity scope for a plan row: resolves the effective scope, loads the
 * searchable entity list, and builds the scope popover for ScopedPlanRow.
 */
export function usePlanScopeField({
	planEntityId,
	defaultEntityId,
	onChange,
	disabled,
	disabledReason,
}: {
	planEntityId?: string | null;
	defaultEntityId?: string;
	onChange: (entityId: string | null | undefined) => void;
	disabled?: boolean;
	disabledReason?: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const effectiveEntityId = resolvePlanEntityId({
		planEntityId,
		defaultEntityId,
	});
	const { hasEntities, entities, selectedEntity, isLoading, setSearch } =
		useScopeEntitySearch({ selectedEntityId: effectiveEntityId });

	const isUnset = planEntityId === undefined;
	// An unset row shows the sheet's scope rather than an "inherit" option.
	const pickerValue = isUnset ? (defaultEntityId ?? null) : planEntityId;
	const selectedLabel = explicitScopeLabel({ planEntityId, selectedEntity });
	const chipLabel =
		selectedLabel ??
		scopeLabel({ entityId: effectiveEntityId, entity: selectedEntity });

	const scope: PlanRowScope | undefined = hasEntities
		? {
				picker: (
					<PlanEntityScopeSelector
						disabled={disabled}
						entities={entities}
						isLoading={isLoading}
						onChange={onChange}
						onOpenChange={setIsOpen}
						onSearchChange={setSearch}
						open={isOpen}
						trigger={
							<PlanScopeChip
								disabled={disabled}
								disabledReason={disabledReason}
								isEntityScoped={!!effectiveEntityId}
								label={chipLabel}
							/>
						}
						value={pickerValue}
					/>
				),
			}
		: undefined;

	const scopeMenu = hasEntities ? (
		<PlanScopeMenuItems
			entities={entities}
			isLoading={isLoading}
			onChange={onChange}
			onSearchChange={setSearch}
			value={effectiveEntityId ?? null}
		/>
	) : undefined;

	return {
		effectiveEntityId,
		hasEntities,
		selectedLabel,
		scope,
		scopeMenu,
		openScope: () => setIsOpen(true),
	};
}
