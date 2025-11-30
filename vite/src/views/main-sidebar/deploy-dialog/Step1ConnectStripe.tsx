import { AppEnv } from "@autumn/shared";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { SectionHeader } from "@/views/onboarding3/components/integration-step/SectionHeader";

interface Step1ConnectStripeProps {
	isDialogOpen: boolean;
}

export const Step1ConnectStripe = ({
	isDialogOpen,
}: Step1ConnectStripeProps) => {
	const { org, mutate } = useOrg({ env: AppEnv.Live });
	const axiosInstance = useAxiosInstance({ env: AppEnv.Live });
	const [isPolling, setIsPolling] = useState(false);
	const [isConnectingStripe, setIsConnectingStripe] = useState(false);

	// Check if Stripe is connected for production
	const isStripeConnected =
		org?.stripe_connection === "oauth" ||
		org?.stripe_connection === "secret_key";

	useEffect(() => {
		if (!isPolling || !isDialogOpen) return;

		const pollInterval = setInterval(async () => {
			await mutate();

			// Check if stripe is now connected
			if (
				org?.stripe_connection === "oauth" ||
				org?.stripe_connection === "secret_key"
			) {
				setIsPolling(false);
				setIsConnectingStripe(false);
			}
		}, 2000);

		return () => clearInterval(pollInterval);
	}, [isPolling, isDialogOpen, mutate, org?.stripe_connection]);

	// Reset polling state when dialog opens
	useEffect(() => {
		if (isDialogOpen) {
			setIsPolling(false);
			setIsConnectingStripe(false);
		}
	}, [isDialogOpen]);

	const handleConnectStripe = async () => {
		setIsConnectingStripe(true);
		setIsPolling(true);

		try {
			const { data } = await axiosInstance.get(
				`/v1/organization/stripe/oauth_url`,
				{
					params: {
						redirect_url: `${import.meta.env.VITE_FRONTEND_URL}/close`,
					},
				},
			);
			// Open in a popup window (not "_blank") so window.close() will work
			window.open(
				data.oauth_url,
				"stripe_oauth",
				"width=600,height=800,popup=yes",
			);
		} catch (error) {
			console.error(error);
			toast.error(getBackendErr(error, "Failed to get OAuth URL"));
			setIsPolling(false);
			setIsConnectingStripe(false);
		}
	};

	return (
		<div className="flex gap-3">
			<div className="flex items-center gap-2">
				<SectionHeader
					stepNumber={1}
					title="Connect your Stripe account"
					description="Connect your Stripe production account via OAuth to accept live payments"
					className="gap-0 flex-1"
				/>
			</div>

			<div className="pl-[32px] flex gap-2">
				{isStripeConnected ? (
					<div className="flex items-center gap-2">
						<IconButton
							variant="secondary"
							disabled
							icon={<Check size={16} className="text-green-600" />}
							className="!opacity-100"
						>
							Stripe Connected
						</IconButton>
					</div>
				) : (
					<div>
						<Button
							variant="secondary"
							onClick={handleConnectStripe}
							isLoading={isConnectingStripe}
							className="w-36"
						>
							Connect Live Stripe
						</Button>
					</div>
				)}
			</div>
		</div>
	);
};
