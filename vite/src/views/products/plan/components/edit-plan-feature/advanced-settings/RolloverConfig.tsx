import {
	type RolloverConfig as RolloverConfigType,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

type MaxMode = "absolute" | "percentage" | "unlimited";

/** Visibility is controlled by parent AdvancedSettings */
export function RolloverConfig() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const defaultRollover: RolloverConfigType = {
		duration: RolloverExpiryDurationType.Month,
		length: 1 as number,
		max: null,
		max_percentage: null,
	};

	const setRolloverConfigKey = (
		key: keyof RolloverConfigType,
		value: null | number | RolloverExpiryDurationType,
	) => {
		setItem({
			...item,
			config: {
				...(item.config || {}),
				rollover: {
					...(item.config?.rollover || defaultRollover),
					[key]: value,
				},
			},
		});
	};

	const setRolloverConfig = (rollover: RolloverConfigType | null) => {
		const newConfig = { ...(item.config || {}) };
		if (rollover === null) {
			delete newConfig.rollover;
		} else {
			newConfig.rollover = rollover;
		}
		setItem({
			...item,
			config: newConfig,
		});
	};

	const rollover = item.config?.rollover as RolloverConfigType;
	const hasRollover = item.config?.rollover != null;

	const maxMode: MaxMode =
		rollover?.max_percentage != null
			? "percentage"
			: rollover?.max === null
				? "unlimited"
				: "absolute";

	const handleMaxModeChange = (mode: MaxMode) => {
		const current = item.config?.rollover || defaultRollover;
		if (mode === "unlimited") {
			setRolloverConfig({
				...current,
				max: null,
				max_percentage: null,
			});
		} else if (mode === "absolute") {
			setRolloverConfig({
				...current,
				max: 0,
				max_percentage: null,
			});
		} else {
			setRolloverConfig({
				...current,
				max: null,
				max_percentage: 50,
			});
		}
	};

	return (
		<AreaCheckbox
			title="Rollovers"
			tooltip="Rollovers carry unused credits to the next billing cycle. Set a maximum rollover amount and specify how many cycles before resetting."
			checked={hasRollover}
			disabled={!item.interval}
			onCheckedChange={(checked) => {
				if (checked) {
					setItem({
						...item,
						reset_usage_when_enabled: true,
						config: {
							...(item.config || {}),
							rollover: defaultRollover,
						},
					});
				} else {
					setRolloverConfig(null);
				}
			}}
		>
			<div className="space-y-4 w-xs max-w-full">
				<div className="space-y-2 w-full">
					<FormLabel>Maximum rollover</FormLabel>
					<div className="flex items-center gap-2">
						<Select
							value={maxMode}
							onValueChange={(value) =>
								handleMaxModeChange(value as MaxMode)
							}
						>
							<SelectTrigger
								className="w-32"
								onClick={(e) => e.stopPropagation()}
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="unlimited">Unlimited</SelectItem>
								<SelectItem value="absolute">Absolute</SelectItem>
								<SelectItem value="percentage">Percentage</SelectItem>
							</SelectContent>
						</Select>

						{maxMode === "absolute" && (
							<Input
								type="number"
								value={
									rollover?.max === 0 ? "" : (rollover?.max ?? "")
								}
								className="flex-1"
								placeholder="e.g. 100 credits"
								onChange={(e) => {
									const value = e.target.value;
									const numValue =
										value === "" ? 0 : parseInt(value) || 0;
									setRolloverConfigKey("max", numValue);
								}}
								onClick={(e) => e.stopPropagation()}
							/>
						)}

						{maxMode === "percentage" && (
							<div className="flex items-center gap-1 flex-1">
								<Input
									type="number"
									value={
										rollover?.max_percentage === 0
											? ""
											: (rollover?.max_percentage ?? "")
									}
									className="flex-1"
									placeholder="e.g. 50"
									onChange={(e) => {
										const value = e.target.value;
										const numValue =
											value === "" ? 0 : parseInt(value) || 0;
										setRolloverConfigKey(
											"max_percentage",
											Math.min(100, Math.max(0, numValue)),
										);
									}}
									onClick={(e) => e.stopPropagation()}
								/>
								<span className="text-t3 text-sm">%</span>
							</div>
						)}
					</div>
				</div>

				<div className="space-y-2">
					<FormLabel>Rollover duration</FormLabel>
					<div className="flex items-center gap-2">
						{rollover?.duration === RolloverExpiryDurationType.Month && (
							<Input
								type="number"
								value={rollover?.length === 0 ? "" : rollover?.length || ""}
								onChange={(e) => {
									const value = e.target.value;
									const numValue = value === "" ? 0 : parseInt(value) || 0;
									setRolloverConfigKey("length", numValue);
								}}
								className="w-16"
								placeholder="e.g. 1 month"
								onClick={(e) => e.stopPropagation()}
							/>
						)}
						<Select
							value={rollover?.duration}
							onValueChange={(value) => {
								setRolloverConfigKey(
									"duration",
									value as RolloverExpiryDurationType,
								);
							}}
						>
							<SelectTrigger
								className="flex-1"
								onClick={(e) => e.stopPropagation()}
							>
								<SelectValue placeholder="Select duration" />
							</SelectTrigger>
							<SelectContent>
								{Object.values(RolloverExpiryDurationType).map((duration) => (
									<SelectItem key={duration} value={duration}>
										{duration}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>
		</AreaCheckbox>
	);
}
