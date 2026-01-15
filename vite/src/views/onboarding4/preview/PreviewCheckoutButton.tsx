import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";

type CheckoutState = "idle" | "waiting_for_sync" | "creating_checkout";

interface PreviewCheckoutButtonProps {
	productId: string;
	previewApiKey: string;
	isSyncing: boolean;
}

export function PreviewCheckoutButton({
	productId,
	previewApiKey,
	isSyncing,
}: PreviewCheckoutButtonProps) {
	const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");

	const createCheckout = useCallback(async () => {
		setCheckoutState("creating_checkout");
		try {
			console.log(
				`[Preview Checkout] Starting checkout for product: ${productId}`,
			);

			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/v1/checkout`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${previewApiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						customer_id: "preview_customer",
						product_id: productId,
						success_url: window.location.href,
					}),
				},
			);

			if (!response.ok) {
				const error = await response.json();
				console.error("[Preview Checkout] Failed:", error);
				setCheckoutState("idle");
				return;
			}

			const result = await response.json();
			console.log("[Preview Checkout] Result:", result);

			if (result.url) {
				window.open(result.url, "_blank");
			} else {
				console.error("[Preview Checkout] No URL in response");
			}
		} catch (error) {
			console.error("[Preview Checkout] Error:", error);
		} finally {
			setCheckoutState("idle");
		}
	}, [productId, previewApiKey]);

	// When syncing finishes and we were waiting for it, create checkout
	useEffect(() => {
		if (checkoutState === "waiting_for_sync" && !isSyncing) {
			createCheckout();
		}
	}, [checkoutState, isSyncing, createCheckout]);

	const handleClick = () => {
		if (isSyncing) {
			// Wait for sync to complete
			setCheckoutState("waiting_for_sync");
		} else {
			// Sync is done, create checkout immediately
			createCheckout();
		}
	};

	const isLoading = checkoutState !== "idle";

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
			disabled={isLoading}
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
