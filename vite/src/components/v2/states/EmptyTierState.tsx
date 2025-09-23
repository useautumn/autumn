interface EmptyTierStateProps {
	onAddTier: () => void;
	isDisabled?: boolean;
	title?: string;
	subtitle?: string;
	buttonText?: string;
}

export function EmptyTierState({
	onAddTier,
	isDisabled = false,
	title = "No pricing tiers configured",
	subtitle = "This item doesn't have tiered pricing set up yet.",
	buttonText = "Add first tier",
}: EmptyTierStateProps) {
	return (
		<div className="text-center py-8 text-muted-foreground empty-tier-state">
			<div className="text-lg mb-2">{title}</div>
			<div className="text-sm mb-4">{subtitle}</div>
			<button
				type="button"
				onClick={onAddTier}
				className={`px-4 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors ${
					isDisabled ? "opacity-50 cursor-not-allowed" : "hover:shadow-sm"
				}`}
				disabled={isDisabled}
				title={isDisabled ? "Read-only mode" : undefined}
			>
				{buttonText}
			</button>
		</div>
	);
}
