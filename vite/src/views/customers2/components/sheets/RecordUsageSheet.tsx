import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "../../customer/CustomerContext";

export function RecordUsageSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const { customer } = useCusQuery();
	const { entityId } = useCustomerContext();
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const featureId = sheetData?.featureId as string | undefined;
	const featureName = sheetData?.featureName as string | undefined;

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
		if (!customerId || !featureId) return;

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
			feature_id: featureId,
			value: parsedValue,
		};

		if (entityId) params.entity_id = entityId;

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
					description={`Record usage for ${featureName ?? featureId}`}
				/>

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
								className="h-6 gap-1 text-xs text-t3"
							>
								<PlusIcon size={12} />
								Add
							</Button>
						</div>

						{properties.length === 0 && (
							<p className="text-xs text-t3">
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
									className="shrink-0 p-1 text-t3 hover:text-destructive transition-colors"
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
					<Button
						variant="primary"
						className="w-full"
						onClick={handleSubmit}
						isLoading={isSubmitting}
					>
						Record
					</Button>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
