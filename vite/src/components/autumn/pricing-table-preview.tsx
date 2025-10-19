import type { ProductV2 } from "@autumn/shared";
import type { Product } from "autumn-js";
import { useCustomer } from "autumn-js/react";
import { useOrg } from "@/hooks/common/useOrg";
import OnboardingCheckoutDialog from "@/views/onboarding3/OnboardingCheckoutDialog";
import { PlanCardPreview } from "./PlanCardPreview";

interface PricingTableProps {
	products?: ProductV2[];
	setConnectStripeOpen: (open: boolean) => void;
	onCheckoutComplete?: () => void;
}

export default function PricingTablePreview({
	products,
	setConnectStripeOpen,
}: PricingTableProps) {
	const { org } = useOrg();
	const { checkout } = useCustomer({
		swrConfig: {
			refreshInterval: 0,
		},
	});

	if (!products || products.length === 0) {
		return null;
	}

	const handleSubscribe = async (product: ProductV2) => {
		if (product.id) {
			try {
				await checkout({
					productId: product.id,
					dialog: OnboardingCheckoutDialog,
					openInNewTab: true,
					successUrl: `${window.location.origin}/sandbox/onboarding3`,
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
			return "Current product";
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
		// Always one column on small screens (vertical flow), more columns only on larger screens
		if (productCount === 1) {
			return "flex flex-col gap-6 max-w-md mx-auto px-4"; // Always vertical
		} else if (productCount === 2) {
			return "flex flex-col gap-6 max-w-2xl mx-auto px-4 sm:grid sm:grid-cols-2 sm:flex-none"; // Vertical on mobile, 2 columns on sm+
		} else {
			return "flex flex-col gap-6 max-w-7xl mx-auto px-4 sm:grid md:grid-cols-2 xl:grid-cols-3 sm:flex-none"; // Vertical on mobile, 2 columns on sm+, 3 on lg+
		}
	};

	return (
		<div className="w-full py-10">
			<div className={getGridClasses()}>
				{products.map((product, index) => (
					<PlanCardPreview
						key={product.id || index}
						product={product}
						buttonText={getButtonText(product as Product)}
						onButtonClick={() => handleSubscribe(product)}
						recommended={isRecommended(product as Product)}
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
