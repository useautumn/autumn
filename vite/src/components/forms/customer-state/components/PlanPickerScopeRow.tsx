import type { Entity } from "@autumn/shared";
import { CaretRightIcon } from "@phosphor-icons/react";
import { type ComponentProps, useState } from "react";
import { PlanEntityScopeSelector } from "@/components/forms/shared/PlanEntityScopeSelector";
import { cn } from "@/lib/utils";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";

const INLINE_ENTITY_COUNT = 3;

const entityKey = (entity: Entity) => entity.id || entity.internal_id;

function ScopeTab({
	label,
	isActive,
	onClick,
}: {
	label: string;
	isActive: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex h-5.5 min-w-0 shrink-0 cursor-pointer items-center rounded-sm border px-2 text-[11.5px] font-medium transition-colors",
				isActive
					? "border-foreground/15 bg-foreground/10 text-foreground"
					: "border-foreground/10 bg-transparent text-tertiary-foreground hover:text-foreground",
			)}
		>
			<span className="max-w-24 truncate">{label}</span>
		</button>
	);
}

function MoreEntitiesButton({
	count,
	...props
}: ComponentProps<"button"> & { count: number }) {
	return (
		<button
			type="button"
			{...props}
			className="flex h-5.5 shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-foreground/10 pr-1.5 pl-2 text-[11.5px] font-medium text-tertiary-foreground transition-colors hover:text-foreground data-popup-open:border-foreground/15 data-popup-open:bg-foreground/10 data-popup-open:text-foreground"
		>
			{count} more
			<CaretRightIcon size={11} />
		</button>
	);
}

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
	const { hasEntities, entities: knownEntities } = useScopeEntitySearch({
		selectedEntityId,
	});
	const entitySearch = useScopeEntitySearch({ selectedEntityId });

	if (!hasEntities) return null;

	const inlineEntities = knownEntities.slice(0, INLINE_ENTITY_COUNT);
	const hiddenSelectedEntity = knownEntities
		.slice(INLINE_ENTITY_COUNT)
		.find((entity) => entityKey(entity) === value);
	const tabEntities = hiddenSelectedEntity
		? [...inlineEntities, hiddenSelectedEntity]
		: inlineEntities;
	const hiddenCount = knownEntities.length - tabEntities.length;

	return (
		<div className="flex items-center gap-1 overflow-hidden border-b border-border/50 px-2 py-1">
			<span className="shrink-0 px-1 text-[11px] font-medium text-subtle">
				For
			</span>
			<ScopeTab
				label="Customer-level"
				isActive={value === null}
				onClick={() => onChange(null)}
			/>
			{tabEntities.map((entity) => (
				<ScopeTab
					key={entityKey(entity)}
					label={entity.name || entityKey(entity)}
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
