import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
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
			toast.success("Checkout settings saved");
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to save checkout settings")),
	});

	return (
		<>
			<Card className="bg-interactive-secondary shadow-none">
				<CardHeader>
					<CardTitle className="text-base">Checkout settings</CardTitle>
					<CardDescription>
						Defaults applied to every checkout session. Both settings can be
						overridden through the API.
					</CardDescription>
				</CardHeader>

				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<span className="text-foreground text-sm font-medium">
							Success URL
						</span>
						<span className="text-sm text-tertiary-foreground">
							The URL users are redirected to after a successful checkout
							session.
						</span>
						<Input
							value={successUrl}
							onChange={(e) => setSuccessUrl(e.target.value)}
							placeholder="eg. https://useautumn.com"
							className={cn(
								"mt-1 !bg-background",
								urlError && "border-red-500",
							)}
						/>
						{urlError && <p className="text-red-500 text-sm">{urlError}</p>}
					</div>

					<div className="flex flex-col gap-1.5">
						<span className="text-foreground text-sm font-medium">
							Default currency
						</span>
						<span className="text-sm text-tertiary-foreground">
							The currency your prices are created in. Shared between sandbox
							and production.
						</span>
						<div className="mt-1">
							<CurrencySelect
								className="!bg-background"
								defaultCurrency={currency.toUpperCase()}
								setDefaultCurrency={setCurrency}
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			<Button
				className="w-full"
				disabled={!canSave}
				onClick={() => save.mutate()}
				isLoading={save.isPending}
			>
				Save
			</Button>
		</>
	);
};
