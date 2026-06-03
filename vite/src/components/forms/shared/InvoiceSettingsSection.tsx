import type { InvoiceTemplate } from "@autumn/shared";
import { AnimatePresence, motion } from "motion/react";
import { Input } from "@/components/v2/inputs/Input";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
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
	const options: Pick<InvoiceTemplate, "id" | "name">[] = [
		{ id: NO_TEMPLATE_VALUE, name: "None" },
		...templates,
	];
	const selectedTemplate = templates.find((t) => t.id === value.templateId);
	return (
		<SheetSection
			title="Invoice Settings"
			withSeparator
			className={cn(disabled && "opacity-50 pointer-events-none")}
		>
			<div className="space-y-4">
				<div className="flex flex-col gap-1.5">
					<span className="text-body-secondary">Template</span>
					<SearchableSelect
						value={value.templateId ?? NO_TEMPLATE_VALUE}
						onValueChange={(next) =>
							onChange({
								...value,
								templateId: next === NO_TEMPLATE_VALUE ? null : next,
							})
						}
						options={options}
						getOptionValue={(option) => option.id}
						getOptionLabel={(option) => option.name}
						placeholder="Select a template"
						emptyText="No templates configured"
					/>
					<AnimatePresence initial={false}>
						{selectedTemplate?.footer && (
							<motion.p
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								transition={{ duration: 0.15, ease: "easeOut" }}
								className="text-tertiary-foreground text-xs whitespace-pre-wrap overflow-hidden"
							>
								{selectedTemplate.footer}
							</motion.p>
						)}
					</AnimatePresence>
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="text-body-secondary">Net payment terms (days)</span>
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
					<span className="text-tertiary-foreground text-xs">
						How long the customer has to pay before the invoice is due.
					</span>
				</div>
			</div>
		</SheetSection>
	);
}
