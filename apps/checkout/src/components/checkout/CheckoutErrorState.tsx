import { CheckoutBackground } from "@/components/checkout/CheckoutBackground";

export function CheckoutErrorState({ message }: { message: string }) {
	return (
		<CheckoutBackground>
			<div className="flex flex-col gap-4">
				<h2 className="text-lg font-semibold text-destructive">
					Something went wrong
				</h2>
				<p className="text-muted-foreground">{message}</p>
			</div>
		</CheckoutBackground>
	);
}
