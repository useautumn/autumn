import { AppEnv } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { useOrg } from "@/hooks/common/useOrg";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { SectionHeader } from "./SectionHeader";

export const ConnectStripeSection = () => {
	const { org, mutate: mutateOrg } = useOrg();
	const [apiKey, setApiKey] = useState("");
	const [loading, setLoading] = useState(false);
	const axiosInstance = useAxiosInstance({ env: AppEnv.Live });

	const handleConnectStripe = async () => {
		setLoading(true);
		try {
			await OrgService.connectStripe(axiosInstance, {
				secret_key: apiKey,
			});

			toast.success("Successfully connected to Stripe");
			await mutateOrg();
		} catch (error) {
			console.log("Failed to connect Stripe", error);
			toast.error(getBackendErr(error, "Failed to connect Stripe"));
		}

		setLoading(false);
	};

	const stripeConnected = org?.stripe_connected;

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				stepNumber={2}
				title="Connect Stripe"
				description={
					<span>
						Stripe is required to checkout and add your plans to customers. Grab
						your API key{" "}
						<a
							href="https://dashboard.stripe.com/apikeys"
							className="underline"
							target="_blank"
							rel="noreferrer"
						>
							here
						</a>
						.
					</span>
				}
			/>

			<div className="pl-[32px] flex flex-col gap-6">
				<div className="flex flex-col gap-2.5">
					<div className="flex flex-row gap-2">
						<Input
							placeholder="Stripe secret key (sk_test_...)"
							value={stripeConnected ? "Stripe connected" : apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							disabled={stripeConnected}
							className="flex-1"
						/>
						<Button
							onClick={handleConnectStripe}
							isLoading={loading}
							disabled={stripeConnected}
						>
							Connect Stripe
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};
