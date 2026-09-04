import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { AreaCheckbox, IconButton } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { CreditDimensionsSection } from "@/views/products/features/credit-systems/components/CreditDimensionsSection";
import { CreditDimensionsSwitch } from "@/views/products/features/credit-systems/components/CreditDimensionsSwitch";
import { CreditRateCardRow } from "@/views/products/features/credit-systems/components/CreditRateCardRow";
import { useCreditDimensionsToggle } from "@/views/products/features/credit-systems/hooks/useCreditDimensionsToggle";
import { useCreditSchemaList } from "@/views/products/features/credit-systems/hooks/useCreditSchemaList";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

/** Plan-item feature_override: replaces the credit system's rate card for
 * customers on this plan. Visibility (credit-system item + admin) is
 * controlled by parent AdvancedSettings, mirroring RolloverConfig. */
export function FeatureOverrideConfig() {
	const { item, setItem } = useProductItemContext();
	const { features } = useFeaturesQuery();

	const schema: CreditSchemaItem[] =
		item?.config?.feature_override?.schema ?? [];

	const handleSchemaChange = (nextSchema: CreditSchemaItem[] | null) => {
		if (!item) return;
		const newConfig = { ...(item.config || {}) };
		if (nextSchema === null) {
			delete newConfig.feature_override;
		} else {
			newConfig.feature_override = { schema: nextSchema };
		}
		setItem({ ...item, config: newConfig });
	};

	const {
		schemaKeys,
		allSchemaCandidateFeatures,
		availableFeaturesFor,
		expandedKey,
		toggleExpandedKey,
		setSchemaItem,
		addSchemaItem,
		removeSchemaItem,
	} = useCreditSchemaList({
		schema,
		onChange: handleSchemaChange,
		onRemoveLast: () => handleSchemaChange(null),
	});
	const dimensions = useCreditDimensionsToggle({
		schema,
		setSchema: handleSchemaChange,
	});

	if (!item) return null;

	const creditSystem = features.find(
		(feature: Feature) => feature.id === item.feature_id,
	);
	const hasOverride = item.config?.feature_override != null;

	return (
		<AreaCheckbox
			title="Custom rate card"
			description="Override this credit system's rate card for customers on this plan. Replaces the feature's rate card entirely."
			checked={hasOverride}
			onCheckedChange={(checked) => {
				if (checked) {
					// Start from the feature's current schema so the override is an
					// edit of the real rates, not a blank slate.
					handleSchemaChange(
						structuredClone(creditSystem?.config?.schema ?? []),
					);
				} else {
					handleSchemaChange(null);
				}
			}}
		>
			<div className="flex flex-col gap-2">
				{schema.map((schemaItem: CreditSchemaItem, index: number) => {
					const rowKey = schemaKeys[index];

					return (
						<CreditRateCardRow
							key={rowKey}
							item={schemaItem}
							availableFeatures={availableFeaturesFor(schemaItem)}
							allFeatures={allSchemaCandidateFeatures}
							onChange={(next) => setSchemaItem({ index, item: next })}
							onRemove={() => removeSchemaItem(index)}
							isExpanded={expandedKey === rowKey}
							onToggle={() => toggleExpandedKey(rowKey)}
							showRateCardControls={true}
						/>
					);
				})}
				<IconButton
					type="button"
					variant="muted"
					onClick={addSchemaItem}
					disabled={schema.length >= allSchemaCandidateFeatures.length}
					className="w-fit"
					icon={<PlusIcon />}
				>
					Add
				</IconButton>
				<CreditDimensionsSwitch
					checked={dimensions.enabled}
					onCheckedChange={dimensions.setEnabled}
				/>
				{dimensions.enabled && (
					<CreditDimensionsSection
						schema={schema}
						schemaKeys={schemaKeys}
						allFeatures={allSchemaCandidateFeatures}
						onItemChange={setSchemaItem}
					/>
				)}
			</div>
		</AreaCheckbox>
	);
}
