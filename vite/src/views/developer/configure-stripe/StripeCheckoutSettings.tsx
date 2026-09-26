import { Button, Input } from "@autumn/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CurrencySelect } from "@/components/v2/selects/CurrencySelect";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	SETTINGS_LIST_CLASS,
	SettingsGroup,
} from "@/views/settings/components/SettingsGroup";

const isValidUrl = (url: string) =>
	!url || url.startsWith("http://") || url.startsWith("https://");

export const StripeCheckoutSettings = () => {
	const { org, mutate } = useOrg({ skipSandbox: false });
	const axiosInstance = useAxiosInstance();

	const [successUrl, setSuccessUrl] = useState(org?.success_url ?? "");
	const [currency, setCurrency] = useState(org?.default_currency ?? "usd");

	const urlError = isValidUrl(successUrl)
		? ""
		: "URL must start with http:// or https://";
	const isDirty =
		successUrl !== org?.success_url || currency !== org?.default_currency;
	const canSave = isDirty && !urlError;

	const save = useMutation({
		mutationFn: () =>
			OrgService.connectStripe(axiosInstance, {
				success_url: successUrl,
				default_currency: currency,
			}),
		onSuccess: async () => {
			await mutate();
			toast.success("Checkout settings saved");
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to save checkout settings")),
	});

	return (
		<SettingsGroup
			title="Checkout defaults"
			description="Applied to every checkout session. Both can be overridden through the API."
			trailing={
				isDirty && (
					<Button
						size="sm"
						disabled={!canSave}
						onClick={() => save.mutate()}
						isLoading={save.isPending}
					>
						Save
					</Button>
				)
			}
		>
			<div className={SETTINGS_LIST_CLASS}>
				<CheckoutSettingRow
					title="Success URL"
					description="Where customers land after paying"
				>
					<Input
						value={successUrl}
						onChange={(e) => setSuccessUrl(e.target.value)}
						placeholder="eg. https://useautumn.com"
						className={cn("!bg-background", urlError && "border-red-500")}
					/>
					{urlError && <p className="text-red-500 text-xs">{urlError}</p>}
				</CheckoutSettingRow>
				<CheckoutSettingRow
					title="Default currency"
					description="Shared between sandbox and production"
				>
					<CurrencySelect
						className="!bg-background"
						defaultCurrency={currency.toUpperCase()}
						setDefaultCurrency={setCurrency}
					/>
				</CheckoutSettingRow>
			</div>
		</SettingsGroup>
	);
};

const CheckoutSettingRow = ({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) => (
	<div className="flex items-center gap-6 px-4 py-3.5">
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			<span className="font-medium text-foreground text-sm">{title}</span>
			<span className="text-tertiary-foreground text-xs">{description}</span>
		</div>
		<div className="flex w-[280px] shrink-0 flex-col gap-1">{children}</div>
	</div>
);
