import type {
	CreditSystemConfig,
	Entity,
	Feature,
	FullCustomer,
} from "@autumn/shared";
import { FeatureType, LATEST_VERSION } from "@autumn/shared";
import {
	Button,
	FormLabel,
	Input,
	SearchableSelect,
	ShortcutButton,
} from "@autumn/ui";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSheetScopeEntityId } from "@/hooks/useSheetScopeEntityId";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
import { EntityScopeSelector } from "./EntityScopeSelector";

export function RecordUsageSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const { customer } = useCusQuery();
	const [scopeEntityId, setScopeEntityId] = useSheetScopeEntityId(
		customer as FullCustomer | undefined,
	);
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const queryClient = useQueryClient();

	const fullCustomer = customer as FullCustomer | null;
	const entities = fullCustomer?.entities || [];
	const fullEntity = entities.find(
		(e: Entity) => e.id === scopeEntityId || e.internal_id === scopeEntityId,
	);

	const featureId = sheetData?.featureId as string | undefined;
	const featureName = sheetData?.featureName as string | undefined;

	const { features } = useFeaturesQuery();
	const creditSystem = features.find((f) => f.id === featureId);
	const isCreditSystem = creditSystem?.type === FeatureType.CreditSystem;

	// Credit systems can deduct from the credit balance directly (default) or
	// from any metered feature in their schema that still exists.
	const featureOptions = useMemo<Feature[]>(() => {
		if (!(isCreditSystem && creditSystem)) return [];
		const schema =
			(creditSystem.config as CreditSystemConfig | undefined)?.schema ?? [];
		const schemaFeatures = schema
			.map((item) => features.find((f) => f.id === item.metered_feature_id))
			.filter((f): f is Feature => Boolean(f));
		return [creditSystem, ...schemaFeatures];
	}, [isCreditSystem, creditSystem, features]);

	const [selectedFeatureId, setSelectedFeatureId] = useState<
		string | undefined
	>(undefined);
	const trackingFeatureId = selectedFeatureId ?? featureId;
	const trackingFeatureName =
		features.find((f) => f.id === trackingFeatureId)?.name ??
		featureName ??
		featureId;
	const showFeatureSelect = isCreditSystem && featureOptions.length > 1;

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [value, setValue] = useState("1");
	const [properties, setProperties] = useState<
		{ key: string; value: string }[]
	>([]);

	const handleAddProperty = () => {
		setProperties((prev) => [...prev, { key: "", value: "" }]);
	};

	const handleRemoveProperty = ({ index }: { index: number }) => {
		setProperties((prev) => prev.filter((_, i) => i !== index));
	};

	const handlePropertyChange = ({
		index,
		field,
		fieldValue,
	}: {
		index: number;
		field: "key" | "value";
		fieldValue: string;
	}) => {
		setProperties((prev) =>
			prev.map((property, i) =>
				i === index ? { ...property, [field]: fieldValue } : property,
			),
		);
	};

	const handleSubmit = async () => {
		const customerId = customer?.id || customer?.internal_id;
		if (!customerId || !trackingFeatureId) return;

		const parsedValue = value.trim() === "" ? 1 : Number.parseFloat(value);
		if (Number.isNaN(parsedValue)) {
			toast.error("Please enter a valid number for value");
			return;
		}

		const duplicateKeys = properties
			.filter((p) => p.key.trim())
			.map((p) => p.key.trim());
		if (new Set(duplicateKeys).size !== duplicateKeys.length) {
			toast.error("Property keys must be unique");
			return;
		}

		const params: Record<string, unknown> = {
			customer_id: customerId,
			feature_id: trackingFeatureId,
			value: parsedValue,
		};

		if (scopeEntityId) params.entity_id = scopeEntityId;

		const filteredProperties = properties.filter((p) => p.key.trim());
		if (filteredProperties.length > 0) {
			params.properties = Object.fromEntries(
				filteredProperties.map((p) => [p.key.trim(), p.value]),
			);
		}

		setIsSubmitting(true);
		try {
			await axiosInstance.post("/v1/track", params);
			closeSheet();
			toast.success("Usage recorded");
			await new Promise((resolve) => setTimeout(resolve, 500));
			await queryClient.invalidateQueries({ queryKey: ["customer"] });
			await queryClient.invalidateQueries({
				queryKey: ["customer-timeseries-events"],
			});
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to record usage"));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title="Record Usage"
					description={
						scopeEntityId
							? `Tracking for entity ${fullEntity?.name || scopeEntityId}`
							: `Record usage for ${trackingFeatureName}`
					}
				/>

				{entities.length > 0 && (
					<EntityScopeSelector
						entities={entities}
						scopeEntityId={scopeEntityId}
						onScopeChange={setScopeEntityId}
					/>
				)}

				{showFeatureSelect && (
					<SheetSection withSeparator>
						<FormLabel>Feature</FormLabel>
						<SearchableSelect<Feature>
							value={trackingFeatureId ?? null}
							onValueChange={setSelectedFeatureId}
							options={featureOptions}
							getOptionValue={(feature) => feature.id}
							getOptionLabel={(feature) => feature.name}
							triggerClassName="w-full"
							renderValue={(option) =>
								option ? (
									<span className="flex items-center gap-2 min-w-0">
										<span className="shrink-0">
											{getFeatureIcon({ feature: option })}
										</span>
										<span className="truncate">{option.name}</span>
									</span>
								) : (
									<span className="text-tertiary-foreground">
										Select feature
									</span>
								)
							}
							renderOption={(option, isSelected) => (
								<>
									<div className="flex items-center gap-2 min-w-0 flex-1">
										<span className="shrink-0">
											{getFeatureIcon({ feature: option })}
										</span>
										<span className="truncate">{option.name}</span>
										{option.id === featureId && (
											<span className="shrink-0 text-tertiary-foreground text-xs">
												Credit system
											</span>
										)}
									</div>
									{isSelected && <CheckIcon className="size-4 shrink-0" />}
								</>
							)}
						/>
					</SheetSection>
				)}

				<SheetSection withSeparator>
					<FormLabel>Value</FormLabel>
					<Input
						placeholder="1"
						type="number"
						value={value}
						onChange={(e) => setValue(e.target.value)}
					/>
				</SheetSection>

				<SheetSection withSeparator={false}>
					<div className="flex flex-col gap-3">
						<div className="flex items-center justify-between">
							<FormLabel className="mb-0">Properties</FormLabel>
							<Button
								variant="ghost"
								size="sm"
								onClick={handleAddProperty}
								className="h-6 gap-1 text-xs text-tertiary-foreground"
							>
								<PlusIcon size={12} />
								Add
							</Button>
						</div>

						{properties.length === 0 && (
							<p className="text-xs text-tertiary-foreground">
								No properties added. Click "Add" to attach metadata.
							</p>
						)}

						{properties.map((property, index) => (
							<div key={index} className="flex items-center gap-2">
								<Input
									placeholder="Key"
									value={property.key}
									onChange={(e) =>
										handlePropertyChange({
											index,
											field: "key",
											fieldValue: e.target.value,
										})
									}
									className="flex-1"
								/>
								<Input
									placeholder="Value"
									value={property.value}
									onChange={(e) =>
										handlePropertyChange({
											index,
											field: "value",
											fieldValue: e.target.value,
										})
									}
									className="flex-1"
								/>
								<button
									type="button"
									onClick={() => handleRemoveProperty({ index })}
									className="shrink-0 p-1 text-tertiary-foreground hover:text-destructive transition-colors"
								>
									<TrashIcon size={14} />
								</button>
							</div>
						))}
					</div>
				</SheetSection>

				<div className="flex-1" />

				<SheetFooter>
					<Button
						variant="secondary"
						className="w-full"
						onClick={closeSheet}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<ShortcutButton
						variant="primary"
						className="w-full"
						onClick={handleSubmit}
						isLoading={isSubmitting}
						metaShortcut="enter"
					>
						Record
					</ShortcutButton>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
