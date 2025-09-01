import { useState } from "react";
import {
	CustomDialogBody,
	CustomDialogContent,
	CustomDialogFooter,
} from "@/components/general/modal-components/DialogContentWrapper";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useModelPricingContext } from "./model-pricing/ModelPricingContext";
import { connectStripe } from "./utils/connectStripe";

export default function ConnectStripeDialog({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) {
	const { stripeConnected, mutate, productDataState, data } =
		useModelPricingContext();
	const axiosInstance = useAxiosInstance();

	const [testApiKey, setTestApiKey] = useState("");
	const [loading, setLoading] = useState(false);
	const handleConnectStripe = async () => {
		setLoading(true);
		await connectStripe({ testApiKey, axiosInstance, mutate });
		setOpen(false);
		setLoading(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<CustomDialogContent fromTop={false} className="w-lg">
				<CustomDialogBody>
					<DialogHeader>
						<DialogTitle>Connect your Stripe account</DialogTitle>
					</DialogHeader>
					<p className="text-t2 text-sm">
						To add a product to a customer, first connect your Stripe account.
						Grab your secret key{" "}
						<a
							href="https://dashboard.stripe.com/test/apikeys"
							target="_blank"
							className="underline"
							rel="noopener"
						>
							here
						</a>
					</p>
					{/* <ConnectStripeStep mutate={mutate} productData={data} /> */}
					<Input
						className="w-full"
						placeholder="Stripe secret key (sk_test_...)"
						value={stripeConnected ? "Stripe connected  ✅ " : testApiKey}
						onChange={(e) => setTestApiKey(e.target.value)}
						disabled={stripeConnected}
					/>
				</CustomDialogBody>
				<CustomDialogFooter>
					<Button
						variant="add"
						onClick={handleConnectStripe}
						isLoading={loading}
					>
						Connect Stripe
					</Button>
				</CustomDialogFooter>
			</CustomDialogContent>
		</Dialog>
	);
}
