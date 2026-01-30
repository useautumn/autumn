import type { BillingPreviewResponse } from "@autumn/shared";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { formatAmount } from "@/utils/formatUtils";
import { cn } from "@/lib/utils";

interface OrderSummaryProps {
	planName: string;
	preview: BillingPreviewResponse;
}

export function OrderSummary({ planName, preview }: OrderSummaryProps) {
	const { line_items, total, currency, period_start, period_end } = preview;

	const hasBillingPeriod = period_start && period_end;

	// Separate base item from sub-items
	const baseItem = line_items.find((item) => item.is_base);
	const subItems = line_items.filter((item) => !item.is_base);

	return (
		<div className="flex flex-col gap-4">
			{/* Plan name and billing period */}
			<div className="flex items-center justify-between">
				<span className="text-base font-medium text-foreground">{planName}</span>
				{hasBillingPeriod && (
					<span className="text-sm text-muted-foreground">
						Billing Starts: {format(period_start, "d MMM yyyy")}
					</span>
				)}
			</div>

			{/* Line items card */}
			<Card variant="muted" className="py-0 gap-0">
				{/* Base item */}
				{baseItem && (
					<div className="flex items-center justify-between px-4 py-3 border-b border-border">
						<span className="font-medium text-foreground">Base Price</span>
						<span className="font-medium tabular-nums text-foreground">
							{formatAmount(baseItem.amount, currency)}
						</span>
					</div>
				)}

				{/* Sub-items with vertical connector line */}
				{subItems.length > 0 && (
					<div className="relative">
						{/* Vertical connector line */}
						<div className="absolute left-6 top-0 bottom-3 w-px bg-border" />

						{subItems.map((item, index) => {
							const isLast = index === subItems.length - 1;

							return (
								<div
									key={`${item.title}-${index}`}
									className={cn(
										"flex items-center justify-between pl-10 pr-4 py-3 relative",
										!isLast && "border-b border-border",
									)}
								>
									{/* Horizontal connector line */}
									<div className="absolute left-6 top-1/2 w-3 h-px bg-border" />

									<div className="flex items-center gap-2">
										<span className="text-sm text-foreground">{item.title}</span>
										{item.total_quantity && (
											<span className="text-sm text-muted-foreground">
												x{item.total_quantity}
											</span>
										)}
									</div>
									<span className="text-sm tabular-nums text-foreground">
										{formatAmount(item.amount, currency)}
									</span>
								</div>
							);
						})}
					</div>
				)}

				{/* Total row */}
				<div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
					<span className="font-medium text-foreground">Total</span>
					<span className="font-semibold tabular-nums text-foreground">
						{formatAmount(total, currency)}
					</span>
				</div>
			</Card>
		</div>
	);
}
