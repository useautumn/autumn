import { useState } from "react";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { PlanEntityScopeSelector } from "./PlanEntityScopeSelector";
import { PlanScopeToggleButton } from "./PlanScopeToggleButton";
import type { PlanRowScope } from "./ScopedPlanRow";
import { resolvePlanEntityId } from "./utils/resolvePlanEntityId";

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
	/** Undefined follows `defaultEntityId`; null is an explicit customer level. */
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
	const selectedLabel = isUnset
		? undefined
		: planEntityId === null
			? "Customer-level"
			: (selectedEntity?.name ?? planEntityId);

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
							<PlanScopeToggleButton
								disabled={disabled}
								disabledReason={disabledReason}
								isEntityScoped={!!effectiveEntityId}
								selectedLabel={selectedLabel}
							/>
						}
						value={pickerValue}
					/>
				),
			}
		: undefined;

	return {
		effectiveEntityId,
		hasEntities,
		selectedLabel,
		scope,
		openScope: () => setIsOpen(true),
	};
}
