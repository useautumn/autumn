import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { AppEnv } from "@autumn/shared";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { StepHeader } from "./StepHeader";
import { useOrg } from "@/hooks/common/useOrg";

export const ConnectStripeStep = () => {
	const { org, mutate: mutateOrg } = useOrg();

	const [testApiKey, setTestApiKey] = useState("");

	const [loading, setLoading] = useState(false);

	const axiosInstance = useAxiosInstance({ env: AppEnv.Live });

	const handleConnectStripe = async () => {
		setLoading(true);
		try {
			await OrgService.connectStripe(axiosInstance, {
				secret_key: testApiKey,
			});

			toast.success("Successfully connected to Stripe");
			await mutateOrg();
		} catch (error) {
			console.log("Failed to connect Stripe", error);
			toast.error(getBackendErr(error, "Failed to connect Stripe"));
		}

		setLoading(false);
	};

	// console.log("productData", productData);
	const stripeConnected = org?.stripe_connected;
	return (
		<div className="w-full flex flex-col gap-4">
			<StepHeader number={2} title="Connect Stripe" />
			<p className="text-t2 text-sm">
				Stripe is required to checkout and add your products to customers. Grab
				your API key{" "}
				<a href="https://dashboard.stripe.com/apikeys" className="underline">
					here
				</a>
				.
			</p>
			<div className="flex gap-2 w-full">
				<Input
					className="w-8/10"
					placeholder="Stripe secret key (sk_test_...)"
					value={stripeConnected ? "Stripe connected" : testApiKey}
					onChange={(e) => setTestApiKey(e.target.value)}
					disabled={stripeConnected}
				/>

				<Button
					className="min-w-44 w-44 max-w-44"
					onClick={handleConnectStripe}
					isLoading={loading}
					disabled={stripeConnected}
				>
					Connect Stripe
				</Button>
			</div>
		</div>
	);
};
