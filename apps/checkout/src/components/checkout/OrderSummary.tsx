import type { BillingPreviewResponse } from "@autumn/shared";
import { Card } from "@/components/ui/card";
import { formatAmount, formatDate } from "@/utils/formatUtils";

interface OrderSummaryProps {
	planName: string;
	preview: BillingPreviewResponse;
}

export function OrderSummary({ planName, preview }: OrderSummaryProps) {
	const { line_items, total, currency, next_cycle } = preview;

	return (
		<div className="flex flex-col gap-4">
			{/* Plan name label */}
			<span className="text-base font-medium text-foreground">{planName}</span>

			{/* Line items card */}
			<Card className="py-0 gap-0">
				{/* Line items */}
				<div className="divide-y divide-border">
					{line_items.map((item, index) => {
						const isBasePrice = index === 0;
						return (
							<div
								key={`${item.title}-${index}`}
								className="flex items-center justify-between px-4 py-3"
							>
								<span
									className={
										isBasePrice
											? "font-medium text-foreground"
											: "text-muted-foreground pl-3"
									}
								>
									{item.description}
								</span>
								<span className="font-medium tabular-nums text-foreground">
									{formatAmount(item.amount, currency)}
								</span>
							</div>
						);
					})}
				</div>

				{/* Total row */}
				<div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
					<span className="font-medium text-foreground">Total</span>
					<span className="font-semibold tabular-nums text-foreground">
						{formatAmount(total, currency)}
					</span>
				</div>
			</Card>

			{/* Next cycle info */}
			{next_cycle && (
				<div className="flex items-center justify-between">
					<div className="flex flex-col">
						<span className="text-sm text-muted-foreground">
							New monthly total starting
						</span>
						<span className="text-sm text-muted-foreground">
							{formatDate(next_cycle.starts_at)}
						</span>
					</div>
					<span className="text-lg font-semibold tabular-nums text-foreground">
						{formatAmount(next_cycle.total, currency)}
					</span>
				</div>
			)}
		</div>
	);
}
