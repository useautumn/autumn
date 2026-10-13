import { Tabs, TabsList, TabsTrigger } from "@autumn/ui";
import { XIcon } from "@phosphor-icons/react";
import { CurrencyPicker } from "../shared/CurrencyPicker";

export function CurrencyTabs({
	currencies,
	activeCurrency,
	onSelect,
	onAdd,
	onRemove,
}: {
	currencies: string[];
	activeCurrency: string;
	onSelect: (code: string) => void;
	onAdd: (code: string) => void;
	onRemove: (code: string) => void;
}) {
	const [baseCode, ...additionalCodes] = currencies;
	return (
		<div className="flex items-center gap-4 border-b">
			<Tabs value={activeCurrency} onValueChange={(code) => onSelect(code)}>
				<TabsList variant="underline" className="w-auto border-b-0">
					<TabsTrigger
						value={baseCode}
						variant="underline"
						className="uppercase"
					>
						{baseCode}
					</TabsTrigger>
					{additionalCodes.map((code) => (
						<div className="flex items-center gap-1" key={code}>
							<TabsTrigger
								value={code}
								variant="underline"
								className="uppercase"
							>
								{code}
							</TabsTrigger>
							<button
								type="button"
								aria-label={`Remove ${code.toUpperCase()}`}
								onClick={() => onRemove(code)}
								className="mb-2 cursor-pointer rounded-sm p-0.5 text-tertiary-foreground hover:text-red-500"
							>
								<XIcon className="size-3" />
							</button>
						</div>
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
