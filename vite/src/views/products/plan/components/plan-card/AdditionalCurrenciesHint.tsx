import { type AdditionalCurrencyPrice, formatAmount } from "@autumn/shared";
import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";

const STATE_DOT_COLOR = {
	added: "bg-green-500",
	updated: "bg-amber-500",
	removed: "bg-red-500",
} as const;

export type CurrencyChangeState = keyof typeof STATE_DOT_COLOR;

export const getCurrencyChangeStates = ({
	entries,
	others,
	missingState,
}: {
	entries: AdditionalCurrencyPrice[];
	others: AdditionalCurrencyPrice[];
	missingState: "added" | "removed";
}): Record<string, CurrencyChangeState> => {
	const states: Record<string, CurrencyChangeState> = {};
	for (const entry of entries) {
		const code = entry.currency.toLowerCase();
		const match = others.find((other) => other.currency.toLowerCase() === code);
		if (!match) states[code] = missingState;
		else if (match.amount !== entry.amount) states[code] = "updated";
	}
	return states;
};

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
	changeStates,
}: {
	currencies: AdditionalCurrencyPrice[];
	changeStates?: Record<string, CurrencyChangeState>;
}) => {
	const showDots = Object.keys(changeStates ?? {}).length > 0;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="mt-0.5 text-tertiary-foreground text-xs">
					+{currencies.length}
				</span>
			</TooltipTrigger>
			<TooltipContent>
				<div className="space-y-0.5">
					{currencies.map((entry) => {
						const state = changeStates?.[entry.currency.toLowerCase()];
						return (
							<div className="flex items-center gap-2" key={entry.currency}>
								{showDots && (
									<span
										className={cn(
											"size-1.5 shrink-0 rounded-full",
											state ? STATE_DOT_COLOR[state] : "bg-transparent",
										)}
									/>
								)}
								<span className="w-8 text-tertiary-foreground uppercase">
									{entry.currency}
								</span>
								<span>{formatCurrencyAmount(entry)}</span>
							</div>
						);
					})}
				</div>
			</TooltipContent>
		</Tooltip>
	);
};
