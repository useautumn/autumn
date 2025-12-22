import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
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

	console.log("org", org);

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
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Paste your Stripe secret key</DialogTitle>
					<DialogDescription>
						<div className="flex items-center gap-2">
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
										<strong>Create restricted key</strong>, and enable the
										scopes above with the listed permissions.
									</p>
								</div>
							</InfoTooltip>
						</div>
					</DialogDescription>
				</DialogHeader>

				<Input
					className="w-full"
					placeholder="Stripe secret key (sk_test_...)"
					value={testApiKey}
					onChange={(e) => setTestApiKey(e.target.value)}
				/>

				<DialogFooter>
					<IconButton
						icon={<ArrowSquareOutIcon size={16} />}
						iconOrientation="right"
						className=""
						variant="secondary"
						onClick={() =>
							window.open("https://dashboard.stripe.com/test/apikeys", "_blank")
						}
					>
						Go to Stripe keys
					</IconButton>
					<Button onClick={handleConnectStripe} isLoading={loading}>
						Connect Stripe
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
