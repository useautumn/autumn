import type { BillingPreviewResponse } from "@autumn/shared";
import { format } from "date-fns";
import { formatAmount } from "@/utils/formatUtils";
import { Separator } from "@/components/ui/separator";

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
		<div className="flex flex-col">
			{/* Plan name and billing period */}
			<div className="flex items-center justify-between py-3">
				<span className="text-foreground">{planName}</span>
				{hasBillingPeriod && (
					<span className="text-sm text-muted-foreground">
						{format(period_start, "d MMM yyyy")}
					</span>
				)}
			</div>
			<Separator />

			{/* Line items */}
			<div className="flex flex-col">
				{/* Base item */}
				{baseItem && (
					<>
						<div className="flex items-center justify-between py-3">
							<span className="text-sm text-muted-foreground">Base Price</span>
							<span className="text-sm tabular-nums text-muted-foreground">
								{formatAmount(baseItem.amount, currency)}
							</span>
						</div>
						<Separator />
					</>
				)}

				{/* Sub-items */}
				{subItems.map((item, index) => (
					<div key={item.title}>
						<div className="flex items-center justify-between py-3">
							<div className="flex items-center gap-2">
								<span className="text-sm text-muted-foreground">
									{item.title}
								</span>
								{item.total_quantity && (
									<span className="text-sm text-muted-foreground">
										x{item.total_quantity}
									</span>
								)}
							</div>
							<span className="text-sm tabular-nums text-muted-foreground">
								{formatAmount(item.amount, currency)}
							</span>
						</div>
						{index < subItems.length - 1 && <Separator />}
					</div>
				))}

				{/* Total row */}
				<Separator />
				<div className="flex items-center justify-between py-3">
					<span className="text-sm font-medium text-foreground">Total</span>
					<span className="text-sm font-medium tabular-nums text-foreground">
						{formatAmount(total, currency)}
					</span>
				</div>
			</div>
		</div>
	);
}
