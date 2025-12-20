import type { CreateFeature, CreditSchemaItem, Feature } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";

interface CreditSystemSchemaProps {
	creditSystem: CreateFeature;
	setCreditSystem: (creditSystem: CreateFeature) => void;
}

export function CreditSystemSchema({
	creditSystem,
	setCreditSystem,
}: CreditSystemSchemaProps) {
	const { features } = useFeaturesQuery();

	const schema = creditSystem.config?.schema || [];

	const handleSchemaChange = (
		index: number,
		key: keyof CreditSchemaItem,
		value: string | number,
	) => {
		const newSchema = [...schema];
		newSchema[index] = { ...newSchema[index], [key]: value };
		setCreditSystem({
			...creditSystem,
			config: { ...creditSystem.config, schema: newSchema },
		});
	};

	const addSchemaItem = () => {
		const newSchema = [
			...schema,
			{
				metered_feature_id: "",
				feature_amount: 1,
				credit_amount: 0,
			},
		];
		setCreditSystem({
			...creditSystem,
			config: { ...creditSystem.config, schema: newSchema },
		});
	};

	const removeSchemaItem = (index: number) => {
		if (schema.length === 1) {
			toast.error("There must be at least one feature in the credit system");
			return;
		}
		const newSchema = [...schema];
		newSchema.splice(index, 1);
		setCreditSystem({
			...creditSystem,
			config: { ...creditSystem.config, schema: newSchema },
		});
	};

	const availableMeteredFeatures = features.filter(
		(feature: Feature) => feature.type === FeatureType.Metered,
	);

	return (
		<SheetSection title="Credit Schema" withSeparator={false}>
			<div className="flex flex-col gap-0">
				<div className="grid grid-cols-2 gap-2">
					<FormLabel>Metered Feature</FormLabel>
					<FormLabel>Credit Cost</FormLabel>
				</div>

				<div className="flex flex-col gap-2">
					{schema.map((item: CreditSchemaItem, index: number) => (
						<div key={index} className="grid grid-cols-2 gap-2">
							<Select
								value={item.metered_feature_id}
								onValueChange={(value) =>
									handleSchemaChange(index, "metered_feature_id", value)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select feature" />
								</SelectTrigger>
								<SelectContent>
									{availableMeteredFeatures
										.filter(
											(feature: Feature) =>
												!schema.some(
													(schemaItem: CreditSchemaItem) =>
														feature.id !== item.metered_feature_id &&
														schemaItem.metered_feature_id === feature.id,
												),
										)
										.map((feature: Feature) => (
											<SelectItem key={feature.id} value={feature.id || ""}>
												<span className="block truncate max-w-40">
													{feature.name}
												</span>
											</SelectItem>
										))}
								</SelectContent>
							</Select>

							<div className="flex gap-1">
								<Input
									type="number"
									lang="en"
									value={item.credit_amount || ""}
									onChange={(e) =>
										handleSchemaChange(index, "credit_amount", e.target.value)
									}
									onBlur={(e) =>
										handleSchemaChange(
											index,
											"credit_amount",
											Number(e.target.value) || 0,
										)
									}
									placeholder="eg. 10"
								/>
								<IconButton
									variant="skeleton"
									iconOrientation="center"
									icon={<X />}
									onClick={() => removeSchemaItem(index)}
								/>
							</div>
						</div>
					))}
				</div>

				<IconButton
					variant="muted"
					onClick={addSchemaItem}
					disabled={schema.length >= availableMeteredFeatures.length}
					className="w-fit mt-4"
					icon={<PlusIcon />}
				>
					Add
				</IconButton>
			</div>
		</SheetSection>
	);
}
