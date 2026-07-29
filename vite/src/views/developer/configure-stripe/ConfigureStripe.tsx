import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	IconTooltipButton,
	Skeleton,
	SmallSpinner,
} from "@autumn/ui";
import {
	ArrowSquareOutIcon,
	KeyIcon,
	LinkBreakIcon,
	PlugsConnectedIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import {
	getStripeConnectViewAsLink,
	getStripeDashboardLink,
} from "@/utils/linkUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useMasterStripeAccount } from "@/views/admin/hooks/useMasterStripeAccount";
import ConnectStripeDialog from "@/views/onboarding2/ConnectStripeDialog";
import { CatalogMappingsCard } from "./mappings/CatalogMappingsCard";
import { DisconnectStripeDialog } from "./DisconnectStripeDialog";
import { StripeAccountMismatchBanner } from "./StripeAccountMismatchBanner";
import { StripeChannelCell } from "./StripeChannelCell";
import { StripeCheckoutSettings } from "./StripeCheckoutSettings";
import { StripeDuplicateAccountDialog } from "./StripeDuplicateAccountDialog";
import { useStripeOAuthParams } from "./useStripeOAuthParams";

export const ConfigureStripe = () => {
	const { org, mutate } = useOrg({ skipSandbox: false });
	const { stripeAccount, isLoading: isLoadingStripeAccount } =
		useOrgStripeQuery();
	const axiosInstance = useAxiosInstance();
	const { params, clear: clearOAuthParams } = useStripeOAuthParams();
	const env = useEnv();
	const { isAdmin } = useAdmin();
	const { masterStripeAccount } = useMasterStripeAccount();

	const [showConnectDialog, setShowConnectDialog] = useState(false);
	const [secretKeyMismatch, setSecretKeyMismatch] = useState<string | null>(
		null,
	);

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
	const { data: defaultStripeAccount } = useQuery<{ id: string | null }>({
		queryKey: ["admin", "default-stripe-account", org?.id, env],
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/default-stripe-account");
			return data;
		},
		enabled: isAdmin && !!org?.id && !anyConnected,
	});

	const accountName =
		stripeAccount?.business_profile?.name ||
		stripeAccount?.settings?.dashboard?.display_name;
	const connectedSubtitle = accountName || "Connected";

	const adminConnectedAccountId = oauthConnected
		? stripeAccount?.id
		: !anyConnected
			? defaultStripeAccount?.id
			: null;
	const adminDashboardUrl =
		isAdmin && masterStripeAccount?.id && adminConnectedAccountId
			? getStripeConnectViewAsLink({
					masterAccountId: masterStripeAccount.id,
					connectedAccountId: adminConnectedAccountId,
					env,
					path: "dashboard",
				})
			: null;
	const dashboardUrl = anyConnected
		? (adminDashboardUrl ??
			getStripeDashboardLink({ env, accountId: stripeAccount?.id }))
		: null;

	const description =
		"Connect a secret key, OAuth, or both. The secret key is preferred when both are connected. Both must be the same Stripe account.";

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
						<div className="flex items-start justify-between gap-4">
							<CardTitle className="text-base">
								Connect your Stripe account
							</CardTitle>
							{adminDashboardUrl && (
								<IconTooltipButton
									tooltip="Open in Stripe"
									icon={<ArrowSquareOutIcon size={14} />}
									onClick={() => window.open(adminDashboardUrl, "_blank")}
								/>
							)}
						</div>
						{isLoadingStripeAccount ? (
							<div className="space-y-2">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-3/4" />
							</div>
						) : (
							<CardDescription>
								{description}
								{!anyConnected && (
									<span className="text-muted-foreground">
										{" "}
										You're currently connected to Autumn's default sandbox.
									</span>
								)}
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
						<StripeChannelCell
							title="OAuth"
							icon={<PlugsConnectedIcon />}
							withBorder
							subtitle={
								oauthConnected
									? connectedSubtitle
									: "Sign in with Stripe Connect. Recommended."
							}
							connected={oauthConnected}
							action={
								oauthConnected ? (
									<DisconnectStripeDialog
										channel="oauth"
										label="Disconnect"
										icon={<LinkBreakIcon />}
										onSuccess={mutate}
									/>
								) : (
									<Button
										variant="primary"
										className="w-full gap-1.5"
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

						<StripeChannelCell
							title="Secret Key"
							icon={<KeyIcon />}
							subtitle={
								secretKeyConnected
									? connectedSubtitle
									: "Your Stripe API secret key, used for all operations."
							}
							connected={secretKeyConnected}
							action={
								secretKeyConnected ? (
									<DisconnectStripeDialog
										channel="secret_key"
										label="Disconnect"
										icon={<LinkBreakIcon />}
										onSuccess={mutate}
									/>
								) : (
									<Button
										variant="primary"
										className="w-full gap-1.5"
										onClick={() => setShowConnectDialog(true)}
									>
										<KeyIcon />
										Connect
									</Button>
								)
							}
						/>
					</CardContent>
				</Card>

				{org && <StripeCheckoutSettings key={org.id} />}
				<CatalogMappingsCard />
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
