import { AppEnv } from "@autumn/shared";
import {
	KeyIcon,
	LinkBreakIcon,
	PlugsConnectedIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import SmallSpinner from "@/components/general/SmallSpinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/v2/buttons/Button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useOrg } from "@/hooks/common/useOrg";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { getStripeDashboardLink } from "@/utils/linkUtils";
import ConnectStripeDialog from "@/views/onboarding2/ConnectStripeDialog";
import { DisconnectStripePopover } from "./DisconnectStripePopover";
import { StripeAccountMismatchBanner } from "./StripeAccountMismatchBanner";
import { StripeChannelCell } from "./StripeChannelCell";
import { StripeCheckoutSettings } from "./StripeCheckoutSettings";
import { StripeDuplicateAccountDialog } from "./StripeDuplicateAccountDialog";
import { useStripeOAuthParams } from "./useStripeOAuthParams";

export const ConfigureStripe = () => {
	const { org, mutate } = useOrg();
	const { stripeAccount, isLoading: isLoadingStripeAccount } =
		useOrgStripeQuery();
	const axiosInstance = useAxiosInstance();
	const { params, clear: clearOAuthParams } = useStripeOAuthParams();
	const flags = useAutumnFlags();
	const env = useEnv();

	const [showConnectDialog, setShowConnectDialog] = useState(false);
	const [secretKeyMismatch, setSecretKeyMismatch] = useState<string | null>(
		null,
	);

	const canPasteSecretKey =
		flags.stripe_key === true || flags.platform === true;

	// One banner for both flows: OAuth reports the mismatch via redirect params,
	// the secret key via the connect-dialog error callback.
	const oauthMismatchMessage =
		params.error === "account_mismatch"
			? `The OAuth account ${params.account_id} is different from your connected secret key account ${params.secret_key_account_id}. Both must be the same Stripe account, so OAuth was not connected.`
			: null;
	const mismatchMessage = oauthMismatchMessage ?? secretKeyMismatch;
	const dismissMismatch = () => {
		setSecretKeyMismatch(null);
		if (oauthMismatchMessage) clearOAuthParams();
	};

	const startOAuth = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.get(
				"/v1/organization/stripe/oauth_url",
			);
			window.open(data.oauth_url, "_blank");
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to redirect to OAuth")),
	});

	const secretKeyConnected = org?.stripe_secret_key_connected ?? false;
	const oauthConnected = org?.stripe_oauth_connected ?? false;
	const anyConnected = secretKeyConnected || oauthConnected;

	const accountName =
		stripeAccount?.business_profile?.name ||
		stripeAccount?.settings?.dashboard?.display_name;
	const accountSuffix = accountName ? ` (${accountName})` : "";

	const dashboardUrl = anyConnected
		? getStripeDashboardLink({ env, accountId: stripeAccount?.id })
		: null;

	const unconnectedDescription =
		env === AppEnv.Live
			? "To start taking payments in Production, connect your Stripe live account below:"
			: "You are using a default sandbox account managed by Autumn. Connect your own Stripe account via OAuth, a secret key, or both.";

	return (
		<div className="flex flex-col gap-4">
			{mismatchMessage && (
				<StripeAccountMismatchBanner
					message={mismatchMessage}
					onDismiss={dismissMismatch}
				/>
			)}

			<div className="flex flex-col gap-4">
				<Card className="bg-interactive-secondary shadow-none">
					<CardHeader>
						<CardTitle>Connect your Stripe account</CardTitle>
						{isLoadingStripeAccount ? (
							<div className="space-y-2">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-3/4" />
							</div>
						) : (
							<CardDescription>
								{anyConnected
									? "Secret key is used for all API calls; OAuth grants Stripe dashboard access. You can connect both."
									: unconnectedDescription}
								{dashboardUrl && (
									<span className="text-muted-foreground">
										{" "}
										Visit the Stripe dashboard{" "}
										<a
											href={dashboardUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary underline"
										>
											here
										</a>
									</span>
								)}
							</CardDescription>
						)}
					</CardHeader>

					<CardContent className="flex flex-col">
						{(canPasteSecretKey || secretKeyConnected) && (
							<StripeChannelCell
								title="Secret Key"
								withBorder
								subtitle={
									secretKeyConnected
										? `Connected${accountSuffix}`
										: "Used for all API operations"
								}
								connected={secretKeyConnected}
								action={
									secretKeyConnected ? (
										<DisconnectStripePopover
											channel="secret_key"
											label="Disconnect"
											icon={<LinkBreakIcon />}
											onSuccess={mutate}
										/>
									) : (
										<Button
											variant="primary"
											className="gap-1.5"
											onClick={() => setShowConnectDialog(true)}
										>
											<KeyIcon />
											Connect
										</Button>
									)
								}
							/>
						)}

						<StripeChannelCell
							title="OAuth"
							subtitle={
								oauthConnected
									? `Connected${accountSuffix}`
									: "Grants Stripe dashboard access"
							}
							connected={oauthConnected}
							action={
								oauthConnected ? (
									<DisconnectStripePopover
										channel="oauth"
										label="Disconnect"
										icon={<LinkBreakIcon />}
										onSuccess={mutate}
									/>
								) : (
									<Button
										variant="primary"
										className="gap-1.5"
										disabled={startOAuth.isPending}
										onClick={() => startOAuth.mutate()}
									>
										{startOAuth.isPending ? (
											<SmallSpinner size={14} />
										) : (
											<PlugsConnectedIcon />
										)}
										Connect
									</Button>
								)
							}
						/>
					</CardContent>
				</Card>

				{org && <StripeCheckoutSettings key={org.id} />}
			</div>

			<ConnectStripeDialog
				open={showConnectDialog}
				setOpen={setShowConnectDialog}
				onMismatch={setSecretKeyMismatch}
			/>

			<StripeDuplicateAccountDialog
				open={params.error === "account_already_connected"}
				onClose={clearOAuthParams}
				accountId={params.account_id}
				accountName={params.account_name}
				connectedOrgName={params.connected_org_name}
				connectedOrgSlug={params.connected_org_slug}
			/>
		</div>
	);
};
