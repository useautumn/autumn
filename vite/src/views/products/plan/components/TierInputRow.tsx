import { MinusIcon, PlusIcon } from "@phosphor-icons/react";

interface TierInputRowProps {
	label: string;
	to: string;
	units: number;
	amount: string;
	currency?: string;
	onAddTier: () => void;
	onRemoveTier: () => void;
	onUpdateTier?: (field: "to" | "amount", value: string) => void;
	canAdd?: boolean;
	canRemove?: boolean;
	isReadOnly?: boolean;
}

export function TierInputRow({
	label,
	to,
	units,
	amount,
	currency = "USD",
	onAddTier,
	onRemoveTier,
	onUpdateTier,
	canAdd = true,
	canRemove = true,
	isReadOnly = false,
}: TierInputRowProps) {
	return (
		<div className="flex items-center gap-2 text-sm tier-input-row">
			<span className="text-muted-foreground whitespace-nowrap">{label}</span>

			<div className="px-3 py-1 bg-muted rounded text-center w-20">
				{isReadOnly ? (
					to
				) : (
					<input
						type="text"
						value={to}
						onChange={(e) => onUpdateTier?.("to", e.target.value)}
						className="bg-transparent border-none outline-none text-center w-full"
						placeholder="∞"
					/>
				)}
			</div>

			<span className="text-muted-foreground">units,</span>
			<span className="text-muted-foreground font-medium">{units}</span>
			<span className="text-muted-foreground">units cost</span>

			<div className="px-3 py-1 bg-muted rounded text-center w-16">
				{isReadOnly ? (
					amount
				) : (
					<input
						type="text"
						value={amount}
						onChange={(e) => onUpdateTier?.("amount", e.target.value)}
						className="bg-transparent border-none outline-none text-center w-full"
						placeholder="0"
					/>
				)}
			</div>

			<span className="text-muted-foreground">{currency}</span>

			<div className="flex gap-1 ml-2">
				<button
					type="button"
					onClick={onAddTier}
					className={`w-6 h-6 rounded border flex items-center justify-center text-xs hover:bg-muted transition-colors ${
						!canAdd || isReadOnly
							? "opacity-50 cursor-not-allowed"
							: "hover:border-primary"
					}`}
					disabled={!canAdd || isReadOnly}
					title={isReadOnly ? "Read-only mode" : "Add tier"}
				>
					<PlusIcon size={12} />
				</button>
				<button
					type="button"
					onClick={onRemoveTier}
					className={`w-6 h-6 rounded border flex items-center justify-center text-xs hover:bg-muted transition-colors ${
						!canRemove || isReadOnly
							? "opacity-50 cursor-not-allowed"
							: "hover:border-primary"
					}`}
					disabled={!canRemove || isReadOnly}
					title={isReadOnly ? "Read-only mode" : "Remove tier"}
				>
					<MinusIcon size={12} />
				</button>
			</div>
		</div>
	);
}
