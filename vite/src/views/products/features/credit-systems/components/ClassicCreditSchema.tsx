import type { CreditSchemaItem } from "@autumn/shared";
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
		availableFeaturesFor,
		expandedKey,
		toggleExpandedKey,
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

			<div className="flex flex-col gap-1">
				<FormLabel>Rate card</FormLabel>

				{schema.map((item: CreditSchemaItem, index: number) => {
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
							showRateCardControls={isAdmin}
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
					Add feature
				</IconButton>
			</div>
		</div>
	);
}
