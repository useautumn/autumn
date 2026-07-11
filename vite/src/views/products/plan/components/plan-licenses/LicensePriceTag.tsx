import type { FrontendProduct } from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { getBasePriceDisplay } from "@/utils/product/basePriceDisplayUtils";

/** Quiet read-only price tag sized for the slim license card header. */
export function LicensePriceTag({
	product,
	className,
}: {
	product: FrontendProduct;
	className?: string;
}) {
	const { org } = useOrg();
	const priceDisplay = getBasePriceDisplay({
		product,
		currency: org?.default_currency,
	});

	if (priceDisplay.type !== "price") {
		return (
			<span
				className={cn(
					"text-xs text-tertiary-foreground whitespace-nowrap",
					className,
				)}
			>
				{priceDisplay.displayText}
			</span>
		);
	}

	return (
		<span
			className={cn(
				"inline-flex items-baseline gap-1 text-xs tabular-nums whitespace-nowrap",
				className,
			)}
		>
			<span className="font-medium text-muted-foreground">
				{priceDisplay.formattedAmount}
			</span>
			<span className="text-tertiary-foreground">
				{priceDisplay.intervalText}
			</span>
		</span>
	);
}
