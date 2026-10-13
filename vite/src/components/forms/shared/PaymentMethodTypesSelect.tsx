import type { InvoicePaymentMethod } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
	FormLabel,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { ChevronDownIcon } from "lucide-react";
import { useRef } from "react";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useStripePaymentMethodTypesQuery } from "@/hooks/queries/useStripePaymentMethodTypesQuery";
import { useEnv } from "@/utils/envUtils";
import {
	INVOICE_PAYMENT_METHOD_OPTIONS,
	paymentMethodLabel,
} from "@/utils/invoicePaymentMethodOptions";
import { getStripePaymentMethodConfigLink } from "@/utils/linkUtils";
import { nextPaymentMethodTypes } from "./utils/nextPaymentMethodTypes";

export const ORG_PAYMENT_METHODS_HELPER =
	"Prefilled from your org's allowed payment methods";

export function PaymentMethodTypesSelect({
	value,
	onValueChange,
	description,
	disabled,
}: {
	value: InvoicePaymentMethod[] | null;
	onValueChange: (types: InvoicePaymentMethod[] | null) => void;
	description?: string;
	disabled?: boolean;
}) {
	const { availableTypes, defaultConfiguration, isLoading } =
		useStripePaymentMethodTypesQuery();
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
		: "Default methods";

	// The prefilled value, captured once it loads (or at the first edit when nothing was prefilled).
	const original = useRef<{ value: InvoicePaymentMethod[] | null } | null>(
		null,
	);
	if (!original.current && value?.length) original.current = { value };

	const toggle = ({
		type,
		checked,
	}: {
		type: InvoicePaymentMethod;
		checked: boolean;
	}) => {
		original.current ??= { value };
		onValueChange(
			nextPaymentMethodTypes({
				selected,
				type,
				checked,
				original: original.current.value,
			}),
		);
	};

	return (
		<div className="flex min-w-0 flex-col">
			<FormLabel>Payment methods</FormLabel>
			<DropdownMenu>
				<DropdownMenuTrigger
					disabled={isLoading || disabled}
					className="input-base input-shadow-default input-state-open flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg text-sm whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					<span className="flex min-w-0 items-center gap-1.5">
						<span className="truncate">{summary}</span>
						{!selected.length && defaultConfiguration && (
							<DefaultMethodsCount configuration={defaultConfiguration} />
						)}
					</span>
					<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground opacity-50" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-(--anchor-width)">
					{options.map((option) => (
						<DropdownMenuCheckboxItem
							key={option.value}
							className="cursor-pointer"
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
			{description && (
				<p className="mt-1.5 text-xs text-tertiary-foreground">{description}</p>
			)}
		</div>
	);
}

/** Shows which methods Stripe offers when none are set, with a link to change them in Stripe. */
export function DefaultMethodsCount({
	configuration,
}: {
	configuration: { id: string; payment_method_types: string[] };
}) {
	const env = useEnv();
	const { stripeAccount } = useOrgStripeQuery();
	const types = configuration.payment_method_types;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className="shrink-0 cursor-help rounded border px-1 text-xs tabular-nums text-tertiary-foreground"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					{types.length}
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-64">
				<div className="space-y-1 py-1">
					<p>{types.map(paymentMethodLabel).join(", ") || "None"}</p>
					<p className="text-xs text-tertiary-foreground">
						From your Stripe default payment method settings. Stripe only offers
						the ones that support the invoice's currency.
					</p>
					<a
						href={getStripePaymentMethodConfigLink({
							configurationId: configuration.id,
							env,
							accountId: stripeAccount?.id,
						})}
						target="_blank"
						rel="noreferrer"
						className="text-xs text-primary underline"
					>
						Edit in Stripe
					</a>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
