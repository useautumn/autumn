import { useState } from "react";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";

import {
	CustomDialogBody,
	CustomDialogContent,
	CustomDialogFooter,
} from "@/components/general/modal-components/DialogContentWrapper";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { connectStripe } from "./utils/connectStripe";

export default function ConnectStripeDialog({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) {
	const { org, mutate: mutateOrg } = useOrg();

	const axiosInstance = useAxiosInstance();

	const [testApiKey, setTestApiKey] = useState("");
	const [loading, setLoading] = useState(false);
	const handleConnectStripe = async () => {
		setLoading(true);
		await connectStripe({ testApiKey, axiosInstance, mutate: mutateOrg });
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
					<div className="flex items-center gap-2 mb-2">
						<span className="text-t3 text-sm">
							If you want to use a restricted key
						</span>
						<InfoTooltip>
							<div className="max-w-xs">
								<p className="mb-2">The following scopes are needed:</p>
								<ul className="list-disc list-inside space-y-0.5">
									<li>Core (read & write)</li>
									<li>Checkout (read & write)</li>
									<li>Billing (read & write)</li>
									<li>All webhooks (write)</li>
									<li>Connect → Account Links (write)</li>
								</ul>

								<p className="mt-2 mb-2 text-xs">
									In your Stripe dashboard, go to{" "}
									<strong>Developers → API keys</strong>, click{" "}
									<strong>Create restricted key</strong>, and enable the scopes
									above with the listed permissions.
								</p>
							</div>
						</InfoTooltip>
					</div>
					<Input
						className="w-full"
						placeholder="Stripe secret key (sk_test_...)"
						value={org?.stripe_connected ? "Stripe connected  ✅ " : testApiKey}
						onChange={(e) => setTestApiKey(e.target.value)}
						disabled={org?.stripe_connected}
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
