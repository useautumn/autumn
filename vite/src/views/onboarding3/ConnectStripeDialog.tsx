import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useOrg } from "@/hooks/common/useOrg";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export default function ConnectStripeDialog({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) {
	const { org, mutate: mutateOrg } = useOrg();
	const axiosInstance = useAxiosInstance();
	const flags = useAutumnFlags();

	const [testApiKey, setTestApiKey] = useState("");
	const [loading, setLoading] = useState(false);
	const [showSecretKeyInput, setShowSecretKeyInput] = useState(false);

	// Check if user can paste secret keys (feature flagged)
	const canPasteSecretKey =
		flags.stripe_key === true || flags.platform === true;

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

	const handleConnectStripe = async () => {
		setLoading(true);
		try {
			await OrgService.connectStripe(axiosInstance, {
				secret_key: testApiKey,
			});

			toast.success("Successfully connected to Stripe");
			await mutateOrg();
			setOpen(false);
		} catch (error) {
			console.log("Failed to connect Stripe", error);
			toast.error(getBackendErr(error, "Failed to connect Stripe"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="w-[500px]">
				<DialogHeader>
					<DialogTitle>Connect your Stripe sandbox account</DialogTitle>
				</DialogHeader>

				{!showSecretKeyInput ? (
					<div className="space-y-4">
						<p className="text-body-secondary">
							To preview checkout, please connect your Stripe sandbox account.
						</p>

						<div className="flex flex-col gap-2">
							<Button variant="primary" onClick={handleRedirectToOAuth}>
								Connect via OAuth
							</Button>
							{canPasteSecretKey && (
								<Button
									variant="secondary"
									onClick={() => setShowSecretKeyInput(true)}
								>
									Paste secret key
								</Button>
							)}
						</div>
					</div>
				) : (
					<div className="space-y-4">
						<p className="text-body-secondary">
							Grab your test secret key from your API keys page{" "}
							<a
								href="https://dashboard.stripe.com/test/apikeys"
								target="_blank"
								className="text-primary underline"
								rel="noreferrer"
							>
								here
							</a>
						</p>

						<Input
							placeholder="Stripe secret key (sk_test_...)"
							value={org?.stripe_connected ? "Stripe connected ✅" : testApiKey}
							onChange={(e) => setTestApiKey(e.target.value)}
							disabled={org?.stripe_connected}
						/>

						<DialogFooter>
							<Button
								variant="secondary"
								onClick={() => setShowSecretKeyInput(false)}
							>
								Back
							</Button>
							<Button
								variant="primary"
								onClick={handleConnectStripe}
								isLoading={loading}
								disabled={org?.stripe_connected}
							>
								Connect Stripe
							</Button>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
