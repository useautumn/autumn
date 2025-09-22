import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/hooks/common/useOrg";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import LoadingScreen from "@/views/general/LoadingScreen";
import { CurrencySelect } from "@/views/onboarding/ConnectStripe";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DisconnectStripePopover } from "./DisconnectStripePopover";
import { AppEnv } from "@autumn/shared";
import { useEnv } from "@/utils/envUtils";

export const ConfigureStripe = () => {
	const env = useEnv();
	const { org, isLoading, mutate } = useOrg();
	const axiosInstance = useAxiosInstance();

	const [newStripeConfig, setNewStripeConfig] = useState<any>({
		success_url: org?.success_url,
		default_currency: org?.default_currency,
		secret_key: org?.stripe_connected ? "Stripe connected" : "",
	});

	const [connecting, setConnecting] = useState(false);

	useEffect(() => {
		setNewStripeConfig({
			success_url: org?.success_url,
			default_currency: org?.default_currency,
			stripe_connected: org?.stripe_connected,
		});
	}, [org]);

	const allowSave = () => {
		return (
			newStripeConfig.success_url !== org?.success_url ||
			newStripeConfig.default_currency !== org?.default_currency ||
			(!org?.stripe_connected && !!newStripeConfig.secret_key)
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

	if (isLoading) return <LoadingScreen />;

	return (
		<div className="flex flex-col gap-4">
			<PageSectionHeader title="Stripe Settings" />
			<div className="px-10 max-w-[600px] flex flex-col gap-4">
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
				<div>
					<FieldLabel className="mb-1">
						<span className="text-t2">Stripe Secret Key</span>
					</FieldLabel>
					<p className="text-t3 text-sm mb-2">
						You can retrieve this from your Stripe dashboard{" "}
						<a
							href="https://dashboard.stripe.com/apikeys"
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary underline"
						>
							here
						</a>
						.
					</p>
					{env == AppEnv.Live && (
						<div className="flex items-center gap-2 mb-2">
							<span className="text-t3 text-sm">
								If you want to use a restricted key
							</span>
							<InfoTooltip>
								<div className="max-w-xs">
									<p className="mb-2">The following scopes are needed:</p>
									<ul className="list-disc list-inside space-y-0.5">
										<li>Core</li>
										<li>Checkout</li>
										<li>Billing</li>
										<li>All webhook</li>
										<li>Accounts</li>
									</ul>
								</div>
							</InfoTooltip>
						</div>
					)}

					{org.stripe_connected ? (
						<Input
							disabled
							value="Stripe connected"
							endContent={<Check size={14} className="text-t3" />}
						/>
					) : (
						<Input
							placeholder={env == AppEnv.Live ? "sk_live_..." : "sk_test_..."}
							value={newStripeConfig.secret_key}
							onChange={(e) =>
								setNewStripeConfig({
									...newStripeConfig,
									secret_key: e.target.value,
								})
							}
						/>
					)}
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
					{org.stripe_connected ? (
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
					)}
				</div>
			</div>
		</div>
	);
};
