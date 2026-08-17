import type { Entity } from "@autumn/shared";
import type { SearchableSelectFooter } from "@autumn/ui";
import type { ReactNode } from "react";
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
	trigger,
	open,
	onOpenChange,
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
	/** Renders the picker as a popover off this element instead of a full-width select. */
	trigger?: ReactNode;
	open?: boolean;
	onOpenChange?: (nextOpen: boolean) => void;
}) {
	return (
		<PlanEntityScopeSelector
			entities={entities}
			footer={footer}
			isLoading={isLoading}
			onChange={(entityId) => onScopeChange(entityId ?? undefined)}
			onOpenChange={onOpenChange}
			onSearchChange={onSearchChange}
			open={open}
			showLabel={showLabel}
			trigger={trigger}
			value={scopeEntityId}
			withSeparator={withSeparator}
			wrapInSection={wrapInSection}
		/>
	);
}
