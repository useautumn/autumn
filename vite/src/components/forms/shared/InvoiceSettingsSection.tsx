import type { InvoiceTemplate } from "@autumn/shared";
import {
	Input,
	SearchableSelect,
	SheetAccordion,
	SheetAccordionItem,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { InfoIcon } from "lucide-react";
import { useInvoiceTemplatesQuery } from "@/hooks/queries/useInvoiceTemplatesQuery";
import { cn } from "@/lib/utils";

export const DEFAULT_NET_TERMS_DAYS = 30;
const NO_TEMPLATE_VALUE = "none";

export interface InvoiceSettings {
	templateId: string | null;
	netTermsDays: number;
}

export function InvoiceSettingsSection({
	value,
	onChange,
	disabled,
}: {
	value: InvoiceSettings;
	onChange: (value: InvoiceSettings) => void;
	disabled?: boolean;
}) {
	const { templates } = useInvoiceTemplatesQuery();
	const hasTemplates = templates.length > 0;
	const options: Pick<InvoiceTemplate, "id" | "name">[] = hasTemplates
		? [{ id: NO_TEMPLATE_VALUE, name: "None" }, ...templates]
		: [];
	return (
		<SheetAccordion>
			<SheetAccordionItem value="invoice-more-settings" title="More settings">
				<div
					className={cn(
						"space-y-4",
						disabled && "opacity-50 pointer-events-none",
					)}
				>
					{hasTemplates && (
						<div className="flex flex-col gap-1.5">
							<span className="text-form-label">Template</span>
							<SearchableSelect
								value={value.templateId ?? NO_TEMPLATE_VALUE}
								onValueChange={(next) => {
									const templateId = next === NO_TEMPLATE_VALUE ? null : next;
									const template = templates.find((t) => t.id === templateId);
									onChange({
										templateId,
										netTermsDays: template?.net_terms_days ?? value.netTermsDays,
									});
								}}
								options={options}
								getOptionValue={(option) => option.id}
								getOptionLabel={(option) => option.name}
								placeholder="Select a template"
								emptyText="No templates configured"
							/>
						</div>
					)}
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center gap-1.5">
							<span className="text-form-label">Net payment terms (days)</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<InfoIcon className="size-3.5 text-tertiary-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent>
									How long the customer has to pay before the invoice is due.
								</TooltipContent>
							</Tooltip>
						</div>
						<Input
							type="number"
							min={1}
							value={String(value.netTermsDays)}
							onChange={(e) => {
								const parsed = Number.parseInt(e.target.value, 10);
								onChange({
									...value,
									netTermsDays: Number.isNaN(parsed) ? 0 : parsed,
								});
							}}
						/>
					</div>
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
