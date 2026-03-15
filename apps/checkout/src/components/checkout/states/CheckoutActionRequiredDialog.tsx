import type { BillingResponse } from "@autumn/shared";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { getCheckoutActionRequiredCopy } from "./checkoutActionRequiredCopy";

export function CheckoutActionRequiredDialog({
	response,
}: {
	response: BillingResponse;
}) {
	const paymentUrl = response.payment_url;
	const requiredAction = response.required_action;

	if (!paymentUrl || !requiredAction) {
		return null;
	}

	const copy = getCheckoutActionRequiredCopy({
		code: requiredAction.code,
	});

	return (
		<Dialog open>
			<DialogContent
				showCloseButton={false}
				className="max-w-[calc(100%-2rem)] gap-0 rounded-2xl border-border/80 bg-card/95 p-0 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.5)] backdrop-blur-2xl sm:max-w-[30rem]"
			>
				<div className="flex flex-col gap-5 p-6">
					<DialogHeader className="gap-2">
						<DialogTitle className="text-[1.45rem] leading-tight tracking-tight text-foreground">
							{copy.title}
						</DialogTitle>

						<DialogDescription className="text-[0.98rem] leading-7 text-foreground/78">
							{copy.description}
						</DialogDescription>
					</DialogHeader>
				</div>
				<div className="px-6 pb-6">
					<Button
						className="h-11 w-full rounded-xl text-sm font-medium sm:w-full"
						onClick={() => {
							window.location.assign(paymentUrl);
						}}
					>
						{copy.ctaLabel}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
