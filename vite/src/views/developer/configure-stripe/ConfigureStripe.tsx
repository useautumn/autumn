import { AppEnv } from "@autumn/shared";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/v2/buttons/Button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { CurrencySelect } from "@/components/v2/selects/CurrencySelect";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useOrg } from "@/hooks/common/useOrg";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { getStripeDashboardLink } from "@/utils/linkUtils";
import ConnectStripeDialog from "@/views/onboarding2/ConnectStripeDialog";
import { DisconnectStripePopover } from "./DisconnectStripePopover";

export const ConfigureStripe = () => {
	const { org, mutate } = useOrg();
	const { stripeAccount, isLoading: isLoadingStripeAccount } =
		useOrgStripeQuery();
	const axiosInstance = useAxiosInstance();
	const [searchParams, setSearchParams] = useSearchParams();
	const flags = useAutumnFlags();

	const [newStripeConfig, setNewStripeConfig] = useState({
		success_url: org?.success_url,
		default_currency: org?.default_currency,
	});

	const [connecting, setConnecting] = useState(false);
	const [showConnectDialog, setShowConnectDialog] = useState(false);
	const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
	const env = useEnv();

	// Check if user can paste secret keys (feature flagged)
	const canPasteSecretKey =
		flags.stripe_key === true || flags.platform === true;

	useEffect(() => {
		setNewStripeConfig({
			success_url: org?.success_url,
			default_currency: org?.default_currency,
		});
	}, [org]);

	useEffect(() => {
		const error = searchParams.get("error");
		if (error === "account_already_connected") {
			setShowDuplicateDialog(true);
		}
	}, [searchParams]);

	const allowSave = () => {
		return (
			newStripeConfig.success_url !== org?.success_url ||
			newStripeConfig.default_currency !== org?.default_currency
		);
	};

	const handleConnectStripe = async () => {
		if (!newStripeConfig.success_url) {
			toast.error("Success URL is required");
			return;
		}

		setConnecting(true);

		try {
			await OrgService.connectStripe(axiosInstance, newStripeConfig);
			await mutate();
			toast.success("Successfully connected to Stripe");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to connect Stripe"));
		} finally {
			setConnecting(false);
		}
	};

	const handleRedirectToOAuth = async () => {
		try {
			const { data } = await axiosInstance.get(
				`/v1/organization/stripe/oauth_url`,
			);
			window.open(data.oauth_url, "_blank");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to redirect to OAuth"));
		}
	};

	const getConnectionStatus = () => {
		const connection = org?.stripe_connection;
		const accountName =
			stripeAccount?.business_profile?.name ||
			stripeAccount?.settings?.dashboard?.display_name;

		const accountId = stripeAccount?.id;

		const prefix = accountId
			? `You have connected the Stripe account ${accountId}`
			: "You have your connected your Stripe account";

		if (connection === "secret_key") {
			return {
				description: `${prefix} ${accountName ? ` (${accountName})` : ""} via secret key.`, // Will show dashboard link in the same line
				showDisconnect: true,
				showConnectButtons: false,
				showDefaultAccountLink: true,
			};
		}

		if (connection === "oauth") {
			const accountName =
				stripeAccount?.business_profile?.name ||
				stripeAccount?.settings?.dashboard?.display_name;

			return {
				description: `${prefix} ${accountName ? ` (${accountName})` : ""} via OAuth.`,
				showDisconnect: true,
				showConnectButtons: false,
				showDefaultAccountLink: false,
			};
		}

		if (connection === "default") {
			return {
				description:
					env === AppEnv.Live
						? "To start taking payments in Production, connect your Stripe live account below:"
						: "You are using Autumn's default test account. To connect your own, click the button below",
				showDisconnect: false,
				showConnectButtons: true,
				showDefaultAccountLink: false, // Don't show for default accounts
			};
		}

		return {
			description:
				env === AppEnv.Live
					? "To start taking payments in Production, connect your Stripe live account below:"
					: "No Stripe account connected",
			showDisconnect: false,
			showConnectButtons: true,
			showDefaultAccountLink: false,
		};
	};

	const getDashboardUrl = () => {
		const connection = org?.stripe_connection;

		if (connection === "oauth" && stripeAccount?.id) {
			return getStripeDashboardLink({
				env,
				accountId: stripeAccount?.id,
			});
		}

		// For secret_key, link to main dashboard (no account ID)
		if (connection === "secret_key") {
			return getStripeDashboardLink({
				env,
				accountId: stripeAccount?.id,
			});
		}

		return null;
	};

	const status = getConnectionStatus();
	const dashboardUrl = getDashboardUrl();

	return (
		<div className="flex flex-col gap-4">
			{/* <PageSectionHeader title="Stripe Settings" /> */}
			<div className="px-10 max-w-[600px] flex flex-col gap-4">
				<Card className="shadow-none bg-interactive-secondary">
					<CardHeader>
						<CardTitle>Connect your Stripe account</CardTitle>
						{isLoadingStripeAccount ? (
							<div className="space-y-2">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-3/4" />
							</div>
						) : (
							status.description && (
								<CardDescription>
									{status.description}
									{dashboardUrl && (
										<span className="text-muted-foreground">
											{" "}
											Visit the Stripe dashboard{" "}
											<a
												href={dashboardUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="underline text-primary"
											>
												here
											</a>
										</span>
									)}
								</CardDescription>
							)
						)}
					</CardHeader>

					<CardContent className="flex flex-col gap-2">
						<div className="flex gap-2">
							{status.showConnectButtons && (
								<>
									<Button variant="secondary" onClick={handleRedirectToOAuth}>
										Connect via OAuth
									</Button>
									{canPasteSecretKey && (
										<Button
											variant="secondary"
											onClick={() => setShowConnectDialog(true)}
										>
											Paste secret key
										</Button>
									)}
								</>
							)}

							{status.showDisconnect && (
								<DisconnectStripePopover
									onSuccess={async () => {
										await mutate();
									}}
								/>
							)}
						</div>
					</CardContent>
				</Card>

				<div>
					<FormLabel className="mb-1">
						<span className="text-t2">Success URL</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This will be the default URL that users are redirected to after a
						successful checkout session. It can be overriden through the API.
					</p>
					<Input
						value={newStripeConfig.success_url}
						onChange={(e) =>
							setNewStripeConfig({
								...newStripeConfig,
								success_url: e.target.value,
							})
						}
						placeholder="eg. https://useautumn.com"
					/>
				</div>

				<div>
					<FormLabel className="mb-1">
						<span className="text-t2">Default Currency</span>
					</FormLabel>
					<p className="text-t3 text-sm mb-2">
						This currency that your prices will be created in. This setting is
						shared between your sandbox and production environment.
					</p>
					<CurrencySelect
						defaultCurrency={newStripeConfig.default_currency.toUpperCase()}
						setDefaultCurrency={(currency) =>
							setNewStripeConfig({
								...newStripeConfig,
								default_currency: currency,
							})
						}
					/>
				</div>

				<div className="flex gap-2  mt-2">
					<Button
						className="w-6/12"
						disabled={!allowSave()}
						onClick={handleConnectStripe}
						isLoading={connecting}
					>
						Save
					</Button>
				</div>
			</div>

			<ConnectStripeDialog
				open={showConnectDialog}
				setOpen={setShowConnectDialog}
			/>

			<Dialog
				open={showDuplicateDialog}
				onOpenChange={(open) => {
					setShowDuplicateDialog(open);
					if (!open) {
						// Clear query params when closing dialog
						searchParams.delete("error");
						searchParams.delete("account_id");
						searchParams.delete("account_name");
						searchParams.delete("connected_org_name");
						searchParams.delete("connected_org_slug");
						setSearchParams(searchParams);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Account Already Connected</DialogTitle>
						<DialogDescription>
							The Stripe account{" "}
							<strong>{searchParams.get("account_id")}</strong>
							{searchParams.get("account_name") && (
								<> ({searchParams.get("account_name")})</>
							)}{" "}
							is already connected to the Autumn organization{" "}
							<strong>{searchParams.get("connected_org_name")}</strong>
							{searchParams.get("connected_org_slug") && (
								<> ({searchParams.get("connected_org_slug")})</>
							)}
							. Please disconnect it from there first before connecting to this
							organization.
						</DialogDescription>
					</DialogHeader>
					<Button
						onClick={() => {
							setShowDuplicateDialog(false);
							searchParams.delete("error");
							searchParams.delete("account_id");
							searchParams.delete("account_name");
							searchParams.delete("connected_org_name");
							searchParams.delete("connected_org_slug");
							setSearchParams(searchParams);
						}}
					>
						OK
					</Button>
				</DialogContent>
			</Dialog>
		</div>
	);
};
