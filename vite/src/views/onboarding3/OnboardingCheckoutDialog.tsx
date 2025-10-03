import { useEffect, useState } from "react";
import { useCustomer } from "autumn-js/react";
import type { CheckoutResult } from "autumn-js";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { getCheckoutContent } from "@/lib/autumn/checkout-content";

export interface CheckoutDialogProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	checkoutResult: CheckoutResult;
	onComplete?: () => void;
}

const formatCurrency = ({
	amount,
	currency,
}: { amount: number; currency: string }) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency,
	}).format(amount);
};

export default function OnboardingCheckoutDialog(params: CheckoutDialogProps) {
	const { attach } = useCustomer();
	const [checkoutResult, setCheckoutResult] = useState<
		CheckoutResult | undefined
	>(params?.checkoutResult);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (params.checkoutResult) {
			setCheckoutResult(params.checkoutResult);
		}
	}, [params.checkoutResult]);

	if (!checkoutResult) {
		return null;
	}

	const { open, setOpen } = params;
	const { title, message } = getCheckoutContent(checkoutResult);

	const handleConfirm = async () => {
		setLoading(true);
		try {
			const options = checkoutResult.options.map((option) => ({
				featureId: option.feature_id,
				quantity: option.quantity,
			}));

			await attach({
				productId: checkoutResult.product.id,
				options,
				openInNewTab: true,
			});

			params.onComplete?.();
			setOpen(false);
		} catch (error) {
			console.error("Checkout error:", error);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="w-[500px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<p className="text-body-secondary">{message}</p>

					{/* Product items */}
					<div className="space-y-2">
						<p className="text-body font-semibold">Price</p>
						{checkoutResult.product.items
							.filter((item) => item.type !== "feature")
							.map((item, index) => (
								<div key={index} className="flex justify-between text-body">
									<span className="text-body-secondary">
										{item.feature?.name || "Subscription"}
									</span>
									<span>
										{item.display?.primary_text} {item.display?.secondary_text}
									</span>
								</div>
							))}
					</div>

					{/* Total */}
					<div className="flex justify-between text-body font-semibold pt-2 border-t">
						<span>Total due today</span>
						<span>
							{formatCurrency({
								amount: checkoutResult.total,
								currency: checkoutResult.currency,
							})}
						</span>
					</div>
				</div>

				<DialogFooter>
					<Button variant="primary" onClick={handleConfirm} isLoading={loading}>
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
