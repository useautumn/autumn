import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { CurrencySelect } from "@/components/v2/selects/CurrencySelect";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

const isValidUrl = (url: string) =>
	!url || url.startsWith("http://") || url.startsWith("https://");

export const StripeCheckoutSettings = () => {
	const { org, mutate } = useOrg();
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
			toast.success("Successfully connected to Stripe");
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to connect Stripe")),
	});

	return (
		<>
			<div>
				<FormLabel className="mb-1">
					<span className="text-muted-foreground">Success URL</span>
				</FormLabel>
				<p className="mb-2 text-sm text-tertiary-foreground">
					This will be the default URL that users are redirected to after a
					successful checkout session. It can be overriden through the API.
				</p>
				<Input
					value={successUrl}
					onChange={(e) => setSuccessUrl(e.target.value)}
					placeholder="eg. https://useautumn.com"
					className={cn(urlError && "border-red-500")}
				/>
				{urlError && <p className="mt-1 text-red-500 text-sm">{urlError}</p>}
			</div>

			<div>
				<FormLabel className="mb-1">
					<span className="text-muted-foreground">Default Currency</span>
				</FormLabel>
				<p className="mb-2 text-sm text-tertiary-foreground">
					This currency that your prices will be created in. This setting is
					shared between your sandbox and production environment.
				</p>
				<CurrencySelect
					defaultCurrency={currency.toUpperCase()}
					setDefaultCurrency={setCurrency}
				/>
			</div>

			<Button
				className="mt-2 w-full"
				disabled={!canSave}
				onClick={() => save.mutate()}
				isLoading={save.isPending}
			>
				Save
			</Button>
		</>
	);
};
