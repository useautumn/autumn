import {
	type CreditSchemaItem,
	type Feature,
	isAiCreditSystem,
} from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { X } from "lucide-react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useCreditSchema } from "../hooks/useCreditSchema";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { FeatureSelectDropdown } from "./FeatureSelectDropdown";

interface ClassicCreditSchemaProps {
	form: CreditSystemFormInstance;
}

export function ClassicCreditSchema({ form }: ClassicCreditSchemaProps) {
	const {
		schema,
		schemaKeys,
		allSchemaCandidateFeatures,
		handleSchemaChange,
		addSchemaItem,
		removeSchemaItem,
	} = useCreditSchema(form);

	return (
		<div className="flex flex-col gap-0">
			<div className="grid grid-cols-2 gap-2">
				<FormLabel>Feature</FormLabel>
				<FormLabel>Credit Cost</FormLabel>
			</div>

			<div className="flex flex-col gap-2">
				{schema.map((item: CreditSchemaItem, index: number) => {
					const availableFeatures = allSchemaCandidateFeatures.filter(
						(feature: Feature) =>
							!schema.some(
								(schemaItem: CreditSchemaItem) =>
									feature.id !== item.metered_feature_id &&
									schemaItem.metered_feature_id === feature.id,
							),
					);

					const selectedFeature = allSchemaCandidateFeatures.find(
						(f: Feature) => f.id === item.metered_feature_id,
					);
					const isAiChild = isAiCreditSystem(selectedFeature?.type);

					return (
						<div
							key={schemaKeys[index]}
							className="grid grid-cols-1 lg:grid-cols-2 gap-2"
						>
							<FeatureSelectDropdown
								value={item.metered_feature_id}
								onValueChange={(featureId) =>
									handleSchemaChange(index, "metered_feature_id", featureId)
								}
								availableFeatures={availableFeatures}
								allFeatures={allSchemaCandidateFeatures}
							/>

							<div className="flex flex-col gap-1">
								<div className="flex gap-1">
									<Input
										type="number"
										lang="en"
										value={item.credit_amount ?? ""}
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
								{isAiChild && (
									<span className="text-xs text-muted-foreground">
										credits per $1 of AI usage
									</span>
								)}
							</div>
						</div>
					);
				})}
			</div>

			<IconButton
				variant="muted"
				onClick={addSchemaItem}
				disabled={schema.length >= allSchemaCandidateFeatures.length}
				className="w-fit mt-4"
				icon={<PlusIcon />}
			>
				Add
			</IconButton>
		</div>
	);
}
