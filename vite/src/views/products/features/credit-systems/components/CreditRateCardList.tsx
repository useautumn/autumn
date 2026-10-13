import { IconButton } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useCreditSchemaListContext } from "../hooks/CreditSchemaListContext";
import { CreditRateCardRow } from "./CreditRateCardRow";

export function CreditRateCardList({
	addLabel = "Add feature",
}: {
	addLabel?: string;
}) {
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
					<CreditRateCardRow
						key={rowKey}
						item={item}
						availableFeatures={availableFeaturesFor(item)}
						allFeatures={allSchemaCandidateFeatures}
						onChange={(next) => setSchemaItem({ index, item: next })}
						onRemove={() => removeSchemaItem(index)}
						isExpanded={expandedKey === rowKey}
						onToggle={() => toggleExpandedKey(rowKey)}
						showRateCardControls
					/>
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
