import { IconButton } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useCreditSchemaListContext } from "../hooks/CreditSchemaListContext";
import { CreditRateCardRow } from "./CreditRateCardRow";

/**
 * The rate card editor: a row per metered feature plus the control to add one.
 *
 * Shared by the feature-level schema and the plan-item override, which differ
 * only in the annotation each row carries.
 */
export function CreditRateCardList({
	addLabel = "Add feature",
	renderRowLabel,
}: {
	addLabel?: string;
	/** Optional per-row annotation, rendered above the row. */
	renderRowLabel?: (index: number) => ReactNode;
}) {
	const { isAdmin } = useAdmin();
	const {
		schema,
		schemaKeys,
		allSchemaCandidateFeatures,
		availableFeaturesFor,
		expandedKey,
		toggleExpandedKey,
		setSchemaItem,
		addSchemaItem,
		removeSchemaItem,
	} = useCreditSchemaListContext();

	return (
		<div className="flex flex-col gap-1">
			{schema.map((item, index) => {
				const rowKey = schemaKeys[index];

				return (
					<div key={rowKey} className="flex flex-col gap-1">
						{renderRowLabel?.(index)}
						<CreditRateCardRow
							item={item}
							availableFeatures={availableFeaturesFor(item)}
							allFeatures={allSchemaCandidateFeatures}
							onChange={(next) => setSchemaItem({ index, item: next })}
							onRemove={() => removeSchemaItem(index)}
							isExpanded={expandedKey === rowKey}
							onToggle={() => toggleExpandedKey(rowKey)}
							showRateCardControls={isAdmin}
						/>
					</div>
				);
			})}

			<IconButton
				type="button"
				variant="muted"
				size="sm"
				onClick={addSchemaItem}
				disabled={schema.length >= allSchemaCandidateFeatures.length}
				className="w-full text-tertiary-foreground text-xs"
				icon={<PlusIcon size={10} />}
			>
				{addLabel}
			</IconButton>
		</div>
	);
}
