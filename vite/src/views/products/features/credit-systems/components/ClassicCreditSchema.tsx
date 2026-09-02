import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { Button, FormLabel, Switch } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useCreditSchema } from "../hooks/useCreditSchema";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { CreditRateCardRow } from "./CreditRateCardRow";

interface ClassicCreditSchemaProps {
	form: CreditSystemFormInstance;
}

export function ClassicCreditSchema({ form }: ClassicCreditSchemaProps) {
	const { isAdmin } = useAdmin();
	const {
		schema,
		schemaKeys,
		allSchemaCandidateFeatures,
		invoiceCredit,
		setInvoiceCredit,
		setSchemaItem,
		addSchemaItem,
		removeSchemaItem,
	} = useCreditSchema(form);
	const [expandedKey, setExpandedKey] = useState<string | null>(null);

	const usedFeatureIds = new Set(
		schema.map((schemaItem: CreditSchemaItem) => schemaItem.metered_feature_id),
	);

	return (
		<div className="flex flex-col gap-4">
			{isAdmin && (
				<div className="flex items-center justify-between gap-4">
					<div className="flex flex-col gap-0.5">
						<span className="text-sm font-medium">Invoice credits</span>
						<span className="text-xs text-muted-foreground">
							Itemize usage of this credit system as credits on the invoice.
						</span>
					</div>
					<Switch
						aria-label="Invoice credits"
						checked={invoiceCredit}
						onCheckedChange={setInvoiceCredit}
					/>
				</div>
			)}

			<div className="flex flex-col gap-1">
				<FormLabel>Rate card</FormLabel>

				{schema.map((item: CreditSchemaItem, index: number) => {
					const availableFeatures = allSchemaCandidateFeatures.filter(
						(feature: Feature) =>
							feature.id === item.metered_feature_id ||
							!usedFeatureIds.has(feature.id),
					);
					const rowKey = schemaKeys[index];

					return (
						<CreditRateCardRow
							key={rowKey}
							item={item}
							availableFeatures={availableFeatures}
							allFeatures={allSchemaCandidateFeatures}
							onChange={(next) => setSchemaItem({ index, item: next })}
							onRemove={() => removeSchemaItem(index)}
							isExpanded={expandedKey === rowKey}
							onToggle={() =>
								setExpandedKey(expandedKey === rowKey ? null : rowKey)
							}
							showRateCardControls={isAdmin}
						/>
					);
				})}

				<Button
					variant="dotted"
					aria-label="Add feature"
					onClick={() => setExpandedKey(addSchemaItem() ?? null)}
					disabled={schema.length >= allSchemaCandidateFeatures.length}
					className="!h-9 !rounded-lg w-full !border-dashed !border-primary/50 !bg-transparent !text-primary hover:!border-primary [&_svg]:text-primary"
				>
					<PlusIcon className="size-3" weight="bold" />
					Add feature
				</Button>
			</div>
		</div>
	);
}
