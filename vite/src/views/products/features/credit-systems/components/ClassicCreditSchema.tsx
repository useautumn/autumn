import { FormLabel, Switch } from "@autumn/ui";
import { toast } from "sonner";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { CreditSchemaListProvider } from "../hooks/CreditSchemaListContext";
import { useCreditDimensionsToggle } from "../hooks/useCreditDimensionsToggle";
import { useCreditSchema } from "../hooks/useCreditSchema";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { CreditDimensionsSection } from "./CreditDimensionsSection";
import { CreditDimensionsSwitch } from "./CreditDimensionsSwitch";
import { CreditRateCardList } from "./CreditRateCardList";

interface ClassicCreditSchemaProps {
	form: CreditSystemFormInstance;
}

export function ClassicCreditSchema({ form }: ClassicCreditSchemaProps) {
	const { isAdmin } = useAdmin();
	const { schema, setSchema, invoiceCredit, setInvoiceCredit } =
		useCreditSchema(form);
	const dimensions = useCreditDimensionsToggle({ schema, setSchema });

	return (
		<CreditSchemaListProvider
			schema={schema}
			onChange={setSchema}
			onRemoveLast={() =>
				toast.error("There must be at least one item in the credit system")
			}
		>
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

				{isAdmin && (
					<CreditDimensionsSwitch
						checked={dimensions.enabled}
						onCheckedChange={dimensions.setEnabled}
					/>
				)}

				<div className="flex flex-col gap-1">
					<FormLabel>Rate card</FormLabel>
					<CreditRateCardList />
				</div>

				{isAdmin && dimensions.enabled && <CreditDimensionsSection />}
			</div>
		</CreditSchemaListProvider>
	);
}
