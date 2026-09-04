import { Switch } from "@autumn/ui";

interface CreditDimensionsSwitchProps {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}

export function CreditDimensionsSwitch({
	checked,
	onCheckedChange,
}: CreditDimensionsSwitchProps) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium">Dimensions</span>
				<span className="text-xs text-muted-foreground">
					Price a feature by an event property such as size or region.
				</span>
			</div>
			<Switch
				aria-label="Dimensions"
				checked={checked}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	);
}
