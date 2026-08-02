import type { Entity } from "@autumn/shared";
import type { SearchableSelectFooter } from "@autumn/ui";
import { PlanEntityScopeSelector } from "@/components/forms/shared";

export function EntityScopeSelector({
	entities,
	scopeEntityId,
	onScopeChange,
	footer,
	withSeparator = true,
	wrapInSection = true,
	showLabel = true,
	onSearchChange,
	isLoading,
}: {
	entities: Entity[];
	scopeEntityId: string | undefined;
	onScopeChange: (entityId: string | undefined) => void;
	footer?: SearchableSelectFooter;
	withSeparator?: boolean;
	wrapInSection?: boolean;
	showLabel?: boolean;
	onSearchChange?: (search: string) => void;
	isLoading?: boolean;
}) {
	return (
		<PlanEntityScopeSelector
			entities={entities}
			value={scopeEntityId}
			onChange={(entityId) => onScopeChange(entityId ?? undefined)}
			footer={footer}
			withSeparator={withSeparator}
			wrapInSection={wrapInSection}
			showLabel={showLabel}
			onSearchChange={onSearchChange}
			isLoading={isLoading}
		/>
	);
}
