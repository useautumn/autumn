import type { CreditSchemaItem, Feature } from "@autumn/shared";
import { FormLabel, IconButton, Switch } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
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

			<div className="flex flex-col gap-2">
				<FormLabel>Rate card</FormLabel>

				{schema.map((item: CreditSchemaItem, index: number) => {
					const availableFeatures = allSchemaCandidateFeatures.filter(
						(feature: Feature) =>
							!schema.some(
								(schemaItem: CreditSchemaItem) =>
									feature.id !== item.metered_feature_id &&
									schemaItem.metered_feature_id === feature.id,
							),
					);

					return (
						<CreditRateCardRow
							key={schemaKeys[index]}
							item={item}
							availableFeatures={availableFeatures}
							allFeatures={allSchemaCandidateFeatures}
							onChange={(next) => setSchemaItem({ index, item: next })}
							onRemove={() => removeSchemaItem(index)}
							showRateCardControls={isAdmin}
						/>
					);
				})}
			</div>

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
		</div>
	);
}
