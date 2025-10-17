import { useEffect, useState } from "react";
import { toast } from "sonner";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useOrg } from "@/hooks/common/useOrg";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { CurrencySelect } from "@/views/onboarding/ConnectStripe";

export const ConfigureStripe = () => {
	const { org, mutate } = useOrg();
	const { stripeAccount } = useOrgStripeQuery();
	const axiosInstance = useAxiosInstance();

	const [newStripeConfig, setNewStripeConfig] = useState({
		success_url: org?.success_url,
		default_currency: org?.default_currency,
		// secret_key: org?.stripe_connected ? "Stripe connected" : "",
	});

	const [connecting, setConnecting] = useState(false);
	const [disconnecting, setDisconnecting] = useState(false);

	useEffect(() => {
		setNewStripeConfig({
			success_url: org?.success_url,
			default_currency: org?.default_currency,
			// stripe_connected: org?.stripe_connected,
		});
	}, [org]);

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

	const handleVisitDashboard = () => {
		window.open(
			`https://dashboard.stripe.com/${stripeAccount?.id}/test/dashboard`,
			"_blank",
		);
	};

	const handleDisconnectStripe = async () => {
		setDisconnecting(true);
		try {
			await axiosInstance.delete("/v1/organization/stripe");
			await mutate();
			toast.success("Successfully disconnected account from Stripe");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to disconnect Stripe"));
		} finally {
			setDisconnecting(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<PageSectionHeader title="Stripe Settings" />
			<div className="px-10 max-w-[600px] flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					{org.stripe_connection !== "default" ? (
						<div>
							<Button
								variant="outline"
								onClick={handleDisconnectStripe}
								isLoading={disconnecting}
							>
								Disconnect Stripe
							</Button>
							<Button variant="outline" onClick={handleVisitDashboard}>
								{stripeAccount?.id}
							</Button>
						</div>
					) : (
						<>
							<div className="flex gap-2">
								<Button variant="outline" onClick={handleRedirectToOAuth}>
									Connect via OAuth
								</Button>
								<Button variant="outline">Paste your Stripe secret key</Button>
							</div>
							<div>
								{org.stripe_connection && (
									<p className="text-t3 text-sm mb-2">
										Connection: {org.stripe_connection}
									</p>
								)}
								<Button variant="outline" onClick={handleVisitDashboard}>
									{stripeAccount?.id}
								</Button>
							</div>
						</>
					)}
				</div>
				<Separator />

				<div>
					<FieldLabel className="mb-1">
						<span className="text-t2">Success URL</span>
					</FieldLabel>
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
					<FieldLabel className="mb-1">
						<span className="text-t2">Default Currency</span>
					</FieldLabel>
					<p className="text-t3 text-sm mb-2">
						This currency that your prices will be created in. This setting is
						shared between your sandbox and production environment.
					</p>
					{/* <Input value={org.default_currency} /> */}
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
					{/* {org.stripe_connected ? (
						<DisconnectStripePopover
							onSuccess={async () => {
								await mutate();
								setNewStripeConfig({
									...newStripeConfig,
									secret_key: "",
								});
							}}
						/>
					) : (
						<div className="w-6/12" />
					)} */}
				</div>
			</div>
		</div>
	);
};

// <p className="text-t3 text-sm mb-2">
// 						You can retrieve this from your Stripe dashboard{" "}
// 						<a
// 							href="https://dashboard.stripe.com/apikeys"
// 							target="_blank"
// 							rel="noopener noreferrer"
// 							className="text-primary underline"
// 						>
// 							here
// 						</a>
// 						.
// 					</p>
// 					{env === AppEnv.Live && (
// 						<div className="flex items-center gap-2 mb-2">
// 							<span className="text-t3 text-sm">
// 								If you want to use a restricted key
// 							</span>
// 							<InfoTooltip>
// 								<div className="max-w-xs">
// 									<p className="mb-2">The following scopes are needed:</p>
// 									<ul className="list-disc list-inside space-y-0.5">
// 										<li>Core (read & write)</li>
// 										<li>Checkout (read & write)</li>
// 										<li>Billing (read & write)</li>
// 										<li>All webhooks (write)</li>
// 										<li>Connect → Account Links (write)</li>
// 									</ul>

// 									<p className="mt-2 mb-2 text-xs">
// 										In your Stripe dashboard, go to{" "}
// 										<strong>Developers → API keys</strong>, click{" "}
// 										<strong>Create restricted key</strong>, and enable the
// 										scopes above with the listed permissions.
// 									</p>
// 								</div>
// 							</InfoTooltip>
// 						</div>
// 					)}

// 					{org.stripe_connected ? (
// 						<Input
// 							disabled
// 							value="Stripe connected"
// 							endContent={<Check size={14} className="text-t3" />}
// 						/>
// 					) : (
// 						<Input
// 							placeholder={env === AppEnv.Live ? "sk_live_..." : "sk_test_..."}
// 							value={newStripeConfig.secret_key}
// 							onChange={(e) =>
// 								setNewStripeConfig({
// 									...newStripeConfig,
// 									secret_key: e.target.value,
// 								})
// 							}
// 						/>
// 					)}
