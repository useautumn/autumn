import { Tabs, TabsList, TabsTrigger } from "@autumn/ui";
import { XIcon } from "@phosphor-icons/react";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import {
	addCurrencyToTiers,
	itemCurrencyCodes,
	removeCurrencyFromTiers,
	stampBaseCurrency,
} from "../../utils/currencyUtils";
import { CurrencyPicker } from "../shared/CurrencyPicker";

export function CurrencyTabs({
	baseCurrency,
	activeCurrency,
	onSelect,
}: {
	baseCurrency: string;
	activeCurrency: string;
	onSelect: (code: string) => void;
}) {
	const { item, setItem } = useProductItemContext();
	if (!item) return null;

	const codes = itemCurrencyCodes(item);
	const baseCode = baseCurrency.toLowerCase();
	const applyChange = (next: typeof item) =>
		setItem(stampBaseCurrency({ item: next, orgCurrency: baseCurrency }));

	return (
		<div className="flex items-center gap-4 border-b">
			<Tabs value={activeCurrency} onValueChange={(code) => onSelect(code)}>
				<TabsList variant="underline" className="w-auto border-b-0">
					{[baseCode, ...codes].map((code) => (
						<div className="flex items-center gap-1" key={code}>
							<TabsTrigger
								value={code}
								variant="underline"
								className="uppercase"
							>
								{code}
							</TabsTrigger>
							{code !== baseCode && (
								<button
									type="button"
									aria-label={`Remove ${code.toUpperCase()}`}
									onClick={() =>
										applyChange(removeCurrencyFromTiers({ item, code }))
									}
									className="mb-2 cursor-pointer rounded-sm p-0.5 text-tertiary-foreground hover:text-red-500"
								>
									<XIcon className="size-3" />
								</button>
							)}
						</div>
					))}
				</TabsList>
			</Tabs>
			<CurrencyPicker
				className="mb-1.5"
				excludedCodes={[baseCode, ...codes]}
				label="Currency"
				onSelect={(code) => {
					applyChange(addCurrencyToTiers({ item, code: code.toLowerCase() }));
					onSelect(code.toLowerCase());
				}}
			/>
		</div>
	);
}
