import { type AdditionalCurrencyPrice, formatAmount } from "@autumn/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";

const formatCurrencyAmount = (entry: AdditionalCurrencyPrice) =>
	entry.amount === 0
		? "not set"
		: formatAmount({
				currency: entry.currency,
				amount: entry.amount,
				amountFormatOptions: {
					style: "currency",
					currencyDisplay: "narrowSymbol",
				},
			});

export const AdditionalCurrenciesHint = ({
	currencies,
}: {
	currencies: AdditionalCurrencyPrice[];
}) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<span className="mt-0.5 text-tertiary-foreground text-xs">
				+{currencies.length}
			</span>
		</TooltipTrigger>
		<TooltipContent>
			<div className="space-y-0.5">
				{currencies.map((entry) => (
					<div className="flex items-center gap-2" key={entry.currency}>
						<span className="w-8 text-tertiary-foreground uppercase">
							{entry.currency}
						</span>
						<span>{formatCurrencyAmount(entry)}</span>
					</div>
				))}
			</div>
		</TooltipContent>
	</Tooltip>
);
