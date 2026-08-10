import type { InvoicePaymentMethod, OrgConfig } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const PAYMENT_METHOD_OPTIONS = [
	{ value: "card", label: "Card" },
	{ value: "customer_balance", label: "Bank transfer" },
	{ value: "us_bank_account", label: "ACH direct debit" },
	{ value: "sepa_debit", label: "SEPA direct debit" },
	{ value: "bacs_debit", label: "Bacs direct debit" },
	{ value: "acss_debit", label: "Pre-authorized debit (Canada)" },
	{ value: "link", label: "Link" },
] as const satisfies readonly { value: InvoicePaymentMethod; label: string }[];

export const AllowedPaymentMethodsSubsection = () => {
	const { org, mutate: refetchOrg } = useOrg();
	const axiosInstance = useAxiosInstance();

	const { mutate, isPending, variables } = useMutation({
		mutationFn: async (methods: InvoicePaymentMethod[] | null) => {
			const { data } = await axiosInstance.patch("/organization/config", {
				allowed_payment_methods: methods,
			});
			return data as { config: OrgConfig };
		},
		onSuccess: async () => {
			await refetchOrg();
			toast.success("Invoice payment methods saved");
		},
		onError: () => toast.error("Failed to update invoice payment methods"),
	});

	// While a save is in flight, reflect the value being saved.
	const allowedMethods =
		(isPending ? variables : org?.config?.allowed_payment_methods) ?? null;
	const selected = allowedMethods ?? [];

	const handleToggle = ({
		method,
		checked,
	}: {
		method: InvoicePaymentMethod;
		checked: boolean;
	}) => {
		const next = PAYMENT_METHOD_OPTIONS.filter((option) =>
			option.value === method ? checked : selected.includes(option.value),
		).map((option) => option.value);
		// An empty array would break invoice finalization at Stripe.
		mutate(next.length > 0 ? next : null);
	};

	return (
		<div className="flex items-center justify-between gap-4">
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium">Payment methods</span>
				<span className="text-xs text-muted-foreground">
					{allowedMethods === null
						? "Unset — invoices use your Stripe account's default payment methods"
						: "Only these payment methods are offered on invoices Autumn creates"}
				</span>
			</div>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<IconButton
						variant="secondary"
						size="mini"
						icon={<CaretDownIcon size={12} weight="bold" />}
						iconOrientation="right"
						className="font-medium shrink-0"
					>
						{allowedMethods === null
							? "Stripe defaults"
							: `${selected.length} selected`}
					</IconButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-[260px]">
					{PAYMENT_METHOD_OPTIONS.map((option) => (
						<DropdownMenuCheckboxItem
							key={option.value}
							checked={selected.includes(option.value)}
							onCheckedChange={(checked) =>
								handleToggle({ method: option.value, checked })
							}
							disabled={isPending}
						>
							{option.label}
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
};
