import { formatAmount } from "@autumn/shared";
import { CalendarIcon } from "@phosphor-icons/react";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";
import { CustomDotIcon } from "@/views/products/plan/components/plan-card/PlanFeatureRow";
import type { SummaryItem } from "../types/summary";

export function SummaryItemRow({
	item,
	currency,
}: {
	item: SummaryItem;
	currency: string;
}) {
	const renderIcons = () => {
		if (item.type === "prepaid" && item.productItem) {
			return (
				<div className="flex flex-row items-center gap-1 shrink-0">
					<PlanFeatureIcon item={item.productItem} position="left" />
					<CustomDotIcon />
					<PlanFeatureIcon item={item.productItem} position="right" />
				</div>
			);
		}

		if (item.type === "trial") {
			return (
				<div className="text-blue-500">
					<CalendarIcon size={16} weight="duotone" />
				</div>
			);
		}

		return null;
	};

	const renderChangeIndicator = () => {
		if (item.newValue === null) {
			return (
				<span className="bg-red-500/10 text-red-500 px-2 py-0.5 rounded-md text-xs font-medium">
					Remove
				</span>
			);
		}

		if (item.oldValue !== null && item.oldValue !== item.newValue) {
			return (
				<span className="bg-muted px-2 py-0.5 rounded-md text-xs flex items-center gap-1">
					<span className="text-red-500">{item.oldValue}</span>
					<span className="text-t3">→</span>
					<span className="text-green-500">{item.newValue}</span>
				</span>
			);
		}

		if (item.oldValue === null) {
			return (
				<span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded-md text-xs font-medium">
					+{item.newValue}
				</span>
			);
		}

		return null;
	};

	return (
		<div className="flex items-center w-full h-10 px-3 rounded-xl input-base">
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
				{renderIcons()}

				<p className="whitespace-nowrap truncate flex-1 min-w-0">
					<span className="text-body">{item.label}</span>
					<span className="text-body-secondary"> {item.description}</span>
				</p>
			</div>

			<div className="flex items-center gap-2 shrink-0">
				{renderChangeIndicator()}

				{item.costDelta !== undefined && item.costDelta !== 0 && (
					<span
						className={
							item.costDelta > 0 ? "text-t2 text-xs" : "text-green-600 text-xs"
						}
					>
						{item.costDelta > 0 ? "+" : ""}
						{formatAmount({
							amount: item.costDelta,
							currency,
							minFractionDigits: 2,
							amountFormatOptions: { currencyDisplay: "narrowSymbol" },
						})}
					</span>
				)}
			</div>
		</div>
	);
}
