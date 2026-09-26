import { Button, Skeleton } from "@autumn/ui";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
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
import {
	SETTINGS_LIST_CLASS,
	SettingsGroup,
} from "@/views/settings/components/SettingsGroup";
import { DisconnectStripeDialog } from "./DisconnectStripeDialog";
import { CatalogMappingsCard } from "./mappings/CatalogMappingsCard";
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

	const stripeDashboardUrl = adminDashboardUrl ?? dashboardUrl;
	const connectedAccountSubtitle = stripeAccount?.id
		? `${connectedSubtitle} · ${stripeAccount.id}`
		: connectedSubtitle;
	const connectionDescription = anyConnected
		? "Connect with OAuth, a secret key, or both. They must be the same Stripe account."
		: "You're currently connected to Autumn's default sandbox.";

	return (
		<div className="flex flex-col gap-10">
			{mismatchMessage && (
				<StripeAccountMismatchBanner
					message={mismatchMessage}
					onDismiss={dismissMismatch}
				/>
			)}

			<SettingsGroup
				title="Connection"
				description={connectionDescription}
				trailing={
					stripeDashboardUrl && (
						<a
							href={stripeDashboardUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1 text-subtle text-xs hover:text-foreground"
						>
							Open Stripe dashboard
							<ArrowUpRightIcon size={12} />
						</a>
					)
				}
			>
				{isLoadingStripeAccount ? (
					<Skeleton className="h-[130px] w-full rounded-lg" />
				) : (
					<div className={SETTINGS_LIST_CLASS}>
						<StripeChannelCell
							title="Stripe Connect"
							meta="OAuth · Recommended"
							subtitle={
								oauthConnected
									? connectedAccountSubtitle
									: "Sign in with your Stripe account"
							}
							connected={oauthConnected}
							action={
								oauthConnected ? (
									<DisconnectStripeDialog
										channel="oauth"
										willRemoveCatalogMappings={!secretKeyConnected}
										label="Disconnect"
										onSuccess={mutate}
									/>
								) : (
									<Button
										variant="primary"
										className="w-full"
										isLoading={startOAuth.isPending}
										onClick={() => startOAuth.mutate()}
									>
										Connect
									</Button>
								)
							}
						/>
						<StripeChannelCell
							title="Secret key"
							subtitle={
								secretKeyConnected
									? connectedAccountSubtitle
									: "Preferred over OAuth when both are connected"
							}
							connected={secretKeyConnected}
							action={
								secretKeyConnected ? (
									<DisconnectStripeDialog
										channel="secret_key"
										willRemoveCatalogMappings={!oauthConnected}
										label="Disconnect"
										onSuccess={mutate}
									/>
								) : (
									<Button
										variant="secondary"
										className="w-full"
										onClick={() => setShowConnectDialog(true)}
									>
										Add key
									</Button>
								)
							}
						/>
					</div>
				)}
			</SettingsGroup>

			{org && <StripeCheckoutSettings key={org.id} />}
			<CatalogMappingsCard />

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
