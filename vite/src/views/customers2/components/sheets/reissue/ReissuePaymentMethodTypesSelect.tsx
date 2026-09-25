import type { InvoicePaymentMethod } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
	FormLabel,
} from "@autumn/ui";
import { ChevronDownIcon } from "lucide-react";
import { useStripePaymentMethodTypesQuery } from "@/hooks/queries/useStripePaymentMethodTypesQuery";
import { INVOICE_PAYMENT_METHOD_OPTIONS } from "@/utils/invoicePaymentMethodOptions";

export function ReissuePaymentMethodTypesSelect({
	value,
	onValueChange,
}: {
	value: InvoicePaymentMethod[] | null;
	onValueChange: (types: InvoicePaymentMethod[]) => void;
}) {
	const { availableTypes, isLoading } = useStripePaymentMethodTypesQuery();
	const selected = value ?? [];
	const options = INVOICE_PAYMENT_METHOD_OPTIONS.filter(
		(option) =>
			availableTypes === null ||
			availableTypes.includes(option.value) ||
			selected.includes(option.value),
	);
	const summary = selected.length
		? INVOICE_PAYMENT_METHOD_OPTIONS.filter((option) =>
				selected.includes(option.value),
			)
				.map((option) => option.label)
				.join(", ")
		: "Stripe defaults";

	const toggle = ({
		type,
		checked,
	}: {
		type: InvoicePaymentMethod;
		checked: boolean;
	}) => {
		const next = INVOICE_PAYMENT_METHOD_OPTIONS.map(
			(option) => option.value,
		).filter((option) =>
			option === type ? checked : selected.includes(option),
		);
		// Stripe rejects an empty list, so the last type cannot be removed.
		if (next.length > 0) onValueChange(next);
	};

	return (
		<div className="space-y-1.5">
			<FormLabel>Payment methods</FormLabel>
			<DropdownMenu>
				<DropdownMenuTrigger
					disabled={isLoading}
					className="input-base input-shadow-default input-state-open flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg text-sm whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					<span className="truncate">{summary}</span>
					<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground opacity-50" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-(--anchor-width)">
					{options.map((option) => (
						<DropdownMenuCheckboxItem
							key={option.value}
							checked={selected.includes(option.value)}
							onCheckedChange={(checked) =>
								toggle({ type: option.value, checked })
							}
						>
							{option.label}
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
