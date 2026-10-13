import { Tabs, TabsList, TabsTrigger } from "@autumn/ui";
import { CurrencyPicker } from "../shared/CurrencyPicker";

export function CurrencyTabs({
	currencies,
	activeCurrency,
	onSelect,
	onAdd,
}: {
	currencies: string[];
	activeCurrency: string;
	onSelect: (code: string) => void;
	onAdd: (code: string) => void;
}) {
	return (
		<div className="flex items-center gap-4 border-b">
			<Tabs value={activeCurrency} onValueChange={(code) => onSelect(code)}>
				<TabsList variant="underline" className="w-auto border-b-0">
					{currencies.map((code) => (
						<TabsTrigger
							key={code}
							value={code}
							variant="underline"
							className="uppercase"
						>
							{code}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			<CurrencyPicker
				className="mb-1.5"
				excludedCodes={currencies}
				label="Currency"
				onSelect={onAdd}
			/>
		</div>
	);
}
