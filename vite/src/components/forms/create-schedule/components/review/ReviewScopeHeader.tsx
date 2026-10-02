import { scopeLabel } from "@/components/forms/shared/utils/scopeLabel";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";

/** The editor's scope row inside a phase tray: "Customer-level" or the entity, with its id when named. */
export function ReviewScopeHeader({ entityId }: { entityId: string | null }) {
	const { selectedEntity } = useScopeEntitySearch({
		selectedEntityId: entityId ?? undefined,
	});
	const label = scopeLabel({ entityId, entity: selectedEntity });
	const showsEntityId = entityId !== null && label !== entityId;

	return (
		<div
			className={cn(
				"flex h-8 items-center gap-1.5 bg-table-tray/50 px-3 text-xs",
				TABLE_TRAY_SURFACE_DIVIDER_CLASS,
			)}
		>
			<span className="truncate font-medium text-muted-foreground">
				{label}
			</span>
			{showsEntityId && (
				<span className="truncate text-tertiary-foreground">{entityId}</span>
			)}
		</div>
	);
}
