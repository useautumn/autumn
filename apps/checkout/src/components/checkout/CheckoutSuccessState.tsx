import type { ConfirmCheckoutResponse } from "@autumn/shared";
import { CheckoutBackground } from "@/components/checkout/CheckoutBackground";

export function CheckoutSuccessState({
	result,
}: {
	result: ConfirmCheckoutResponse;
}) {
	return (
		<CheckoutBackground>
			<div className="flex flex-col items-center justify-center gap-4">
				<div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
					<svg
						className="size-6 text-primary"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>
				<div className="text-center">
					<h2 className="text-lg font-semibold">Purchase Complete</h2>
					<p className="text-muted-foreground">
						Your order has been confirmed.
					</p>
				</div>
				{result.invoice_id && (
					<p className="text-sm text-muted-foreground">
						Invoice ID: {result.invoice_id}
					</p>
				)}
			</div>
		</CheckoutBackground>
	);
}
