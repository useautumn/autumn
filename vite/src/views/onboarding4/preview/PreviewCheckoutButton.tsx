import { Button } from "@autumn/ui";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type CheckoutState = "idle" | "waiting_for_sync" | "creating_checkout";

interface PreviewCheckoutButtonProps {
	productId: string;
	isPreviewOrgReady: boolean;
	isSyncing: boolean;
}

export function PreviewCheckoutButton({
	productId,
	isPreviewOrgReady,
	isSyncing,
}: PreviewCheckoutButtonProps) {
	const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
	const axiosInstance = useAxiosInstance();

	const createCheckout = useCallback(async () => {
		if (!isPreviewOrgReady) return;
		setCheckoutState("creating_checkout");
		try {
			// Checkout runs server-side against the preview sandbox org, keyed off
			// the dashboard session — no sandbox API key is exposed to the browser.
			const response = await axiosInstance.post(
				"/pricing-agent/preview/checkout",
				{
					product_id: productId,
					success_path: window.location.pathname + window.location.search,
				},
			);

			if (response.data?.url) {
				window.open(response.data.url, "_blank");
			} else {
				console.error("[Preview Checkout] No URL in response");
			}
		} catch (error) {
			console.error("[Preview Checkout] Error:", error);
		} finally {
			setCheckoutState("idle");
		}
	}, [axiosInstance, productId, isPreviewOrgReady]);

	// When syncing finishes and we were waiting for it, create checkout
	useEffect(() => {
		if (checkoutState === "waiting_for_sync" && !isSyncing) {
			createCheckout();
		}
	}, [checkoutState, isSyncing, createCheckout]);

	const handleClick = () => {
		if (!isPreviewOrgReady) return;
		if (isSyncing) {
			// Wait for sync to complete
			setCheckoutState("waiting_for_sync");
		} else {
			// Sync is done, create checkout immediately
			createCheckout();
		}
	};

	const isLoading = checkoutState !== "idle";
	const isDisabled = isLoading || !isPreviewOrgReady;

	const getButtonText = () => {
		switch (checkoutState) {
			case "waiting_for_sync":
				return "Creating Stripe products...";
			case "creating_checkout":
				return "Redirecting to checkout...";
			default:
				return "Preview Checkout";
		}
	};

	return (
		<Button
			variant="secondary"
			size="sm"
			className="w-full mt-auto"
			onClick={handleClick}
			disabled={isDisabled}
		>
			{isLoading ? (
				<>
					<Loader2 className="size-3 mr-1.5 animate-spin" />
					{getButtonText()}
				</>
			) : (
				getButtonText()
			)}
		</Button>
	);
}
