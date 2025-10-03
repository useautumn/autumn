import type React from "react";
import { useCustomer } from "autumn-js/react";
import { useOrg } from "@/hooks/common/useOrg";
import type { Product } from "autumn-js";
import OnboardingCheckoutDialog from "@/views/onboarding3/OnboardingCheckoutDialog";
import { PlanCardPreview } from "./PlanCardPreview";

interface PricingTableProps {
	products?: Product[];
	setConnectStripeOpen: (open: boolean) => void;
	onCheckoutComplete?: () => void;
}

export default function PricingTablePreview({
	products,
	setConnectStripeOpen,
	onCheckoutComplete,
}: PricingTableProps) {
	const { org } = useOrg();
	const { checkout } = useCustomer();

	if (!products || products.length === 0) {
		return null;
	}

	const handleSubscribe = async (product: Product) => {
		console.log("Subscribe clicked", product);
		console.log("Checkout function:", checkout);
		console.log("Org:", org);

		if (!org?.stripe_connected) {
			console.log("Stripe not connected");
			setConnectStripeOpen(true);
			return;
		}

		if (product.id) {
			console.log("Initiating checkout for product:", product.id);
			try {
				await checkout({
					productId: product.id,
					dialog: OnboardingCheckoutDialog,
					dialogProps: {
						onComplete: onCheckoutComplete,
					},
					openInNewTab: true,
					successUrl: `${window.location.origin}`,
				});
			} catch (error) {
				console.error("Checkout error:", error);
			}
		} else if (product.display?.button_url) {
			window.open(product.display?.button_url, "_blank");
		}
	};

	const getButtonText = (product: Product) => {
		if (product.scenario === "active") {
			return "Current plan";
		}
		if (product.scenario === "downgrade") {
			return "Downgrade";
		}
		if (product.scenario === "upgrade") {
			return "Upgrade";
		}
		return product.display?.button_text || "Subscribe";
	};

	const isRecommended = (product: Product) => {
		return !!product.display?.recommend_text;
	};

	return (
		<div className="w-full py-10">
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto px-4">
				{products.map((product, index) => (
					<PlanCardPreview
						key={product.id || index}
						product={product}
						buttonText={getButtonText(product)}
						onButtonClick={() => handleSubscribe(product)}
						recommended={isRecommended(product)}
						disabled={
							(product.scenario === "active" &&
								!product.properties?.updateable) ||
							product.scenario === "scheduled"
						}
					/>
				))}
			</div>
		</div>
	);
}
