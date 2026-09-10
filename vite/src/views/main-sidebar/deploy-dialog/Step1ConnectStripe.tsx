import { Button, IconButton } from "@autumn/ui";
import { Check } from "lucide-react";
import { SectionHeader } from "@/views/onboarding3/components/integration-step/SectionHeader";
import { useConnectStripe } from "./useDeployActions";

interface Step1ConnectStripeProps {
	isDialogOpen: boolean;
}

export const Step1ConnectStripe = ({
	isDialogOpen,
}: Step1ConnectStripeProps) => {
	const { isConnected, isConnecting, connect } = useConnectStripe({
		isActive: isDialogOpen,
	});

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
				{isConnected ? (
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
							onClick={connect}
							isLoading={isConnecting}
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
