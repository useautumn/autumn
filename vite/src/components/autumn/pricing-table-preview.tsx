import type { Product } from "autumn-js";
import { useCustomer } from "autumn-js/react";

import { useOrg } from "@/hooks/common/useOrg";
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
}: PricingTableProps) {
	const { org } = useOrg();
	const { checkout } = useCustomer();

	if (!products || products.length === 0) {
		return null;
	}

	const handleSubscribe = async (product: Product) => {
		if (!org?.stripe_connected) {
			setConnectStripeOpen(true);
			return;
		}

		if (product.id) {
			try {
				await checkout({
					productId: product.id,
					dialog: OnboardingCheckoutDialog,
					openInNewTab: true,
					successUrl: `${window.location.origin}/onboarding3`,
				});
			} catch (error) {
				console.error("Checkout error:", error);
			}
		} else if (product.display?.button_url) {
			window.open(product.display?.button_url, "_blank");
		}
	};

	const getButtonText = (product: Product) => {
		if (product.scenario === "active" || product.scenario === "cancel") {
			return "Current plan";
		}
		if (product.scenario === "downgrade") {
			return "Downgrade";
		}
		if (product.scenario === "upgrade") {
			return "Upgrade";
		}
		if (product.scenario === "scheduled") {
			return "Scheduled";
		}
		return product.display?.button_text || "Subscribe";
	};

	const isRecommended = (product: Product) => {
		return !!product.display?.recommend_text;
	};

	// Dynamic grid classes based on product count
	const getGridClasses = () => {
		const productCount = products.length;
		if (productCount === 1) {
			return "grid grid-cols-1 gap-6 max-w-md mx-auto px-4"; // Single centered column
		} else if (productCount === 2) {
			return "grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto px-4"; // Two columns max
		} else {
			return "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto px-4"; // Three columns max
		}
	};

	return (
		<div className="w-full py-10">
			<div className={getGridClasses()}>
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
