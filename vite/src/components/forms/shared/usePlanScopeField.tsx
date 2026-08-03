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
	planEntityId?: string | null;
	defaultEntityId?: string;
	onChange: (entityId: string | null | undefined) => void;
	/** Read-only rows still show their scope; later schedule phases inherit it. */
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

	const entityLabel = (entityId: string) => selectedEntity?.name ?? entityId;
	// Undefined means the row still inherits the sheet scope, so nothing is chosen.
	const chosenLabel =
		planEntityId === undefined
			? undefined
			: planEntityId === null
				? "Customer-level"
				: entityLabel(planEntityId);
	// A read-only row has nothing to choose, so it always states its resolved scope.
	const selectedLabel = disabled
		? effectiveEntityId
			? entityLabel(effectiveEntityId)
			: "Customer-level"
		: chosenLabel;

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
						// Unset plans show the sheet's scope rather than an "inherit"
						// option; null is an explicit customer-level choice, not unset.
						value={
							planEntityId === undefined
								? (defaultEntityId ?? null)
								: planEntityId
						}
					/>
				),
			}
		: undefined;

	return {
		effectiveEntityId,
		hasEntities,
		scope,
		openScope: () => setIsOpen(true),
	};
}
