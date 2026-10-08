import { scopeLabel } from "@/components/forms/shared/utils/scopeLabel";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";

export function PlanScopeLabel({ entityId }: { entityId: string | null }) {
	const { selectedEntity } = useScopeEntitySearch({
		selectedEntityId: entityId ?? undefined,
	});

	return (
		<p className="truncate px-2 pt-1.5 pb-1 text-xs font-medium text-tertiary-foreground">
			{scopeLabel({ entityId, entity: selectedEntity })}
		</p>
	);
}
