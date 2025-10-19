import { usePricingTable } from "autumn-js/react";
import PricingTablePreview from "./pricing-table-preview";

interface PricingTableContainerProps {
	setConnectStripeOpen: (open: boolean) => void;
}

export const PricingTableContainer = ({
	setConnectStripeOpen,
}: PricingTableContainerProps) => {
	const { products, isLoading, refetch } = usePricingTable();

	if (isLoading) {
		return (
			<div className="w-full h-full flex items-center justify-center">
				<div className="text-t3">Loading pricing table...</div>
			</div>
		);
	}

	return (
		<PricingTablePreview
			products={products ?? []}
			setConnectStripeOpen={setConnectStripeOpen}
			onCheckoutComplete={refetch}
		/>
	);
};
