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

type MaxMode = "absolute" | "percentage" | "unlimited";

export const DEFAULT_ROLLOVER_CONFIG: RolloverConfigType = {
	duration: RolloverExpiryDurationType.Month,
	length: 1,
	max: null,
	max_percentage: null,
};

type RolloverConfigFormProps = {
	value: RolloverConfigType | null | undefined;
	onChange: (value: RolloverConfigType | null) => void;
	/** Disables the enable/disable checkbox (e.g., when no reset interval is set). */
	disabled?: boolean;
	tooltip?: string;
	title?: string;
	/** Called when the user toggles the rollover on. Defaults to { ...DEFAULT_ROLLOVER_CONFIG }. */
	onEnable?: () => void;
};

/**
 * Fully controlled rollover config UI. The same visual component used inside the plan
 * editor's advanced settings and the balance-create sheet.
 */
export function RolloverConfigForm({
	value,
	onChange,
	disabled,
	tooltip = "Rollovers carry unused credits to the next billing cycle. Set a maximum rollover amount and specify how many cycles before resetting.",
	title = "Rollovers",
	onEnable,
}: RolloverConfigFormProps) {
	const rollover = value ?? null;
	const hasRollover = rollover != null;

	const setRolloverConfigKey = (
		key: keyof RolloverConfigType,
		next: null | number | RolloverExpiryDurationType,
	) => {
		onChange({
			...(rollover ?? DEFAULT_ROLLOVER_CONFIG),
			[key]: next,
		});
	};

	const maxMode: MaxMode =
		rollover?.max_percentage != null
			? "percentage"
			: rollover?.max === null
				? "unlimited"
				: "absolute";

	const handleMaxModeChange = (mode: MaxMode) => {
		const current = rollover ?? DEFAULT_ROLLOVER_CONFIG;
		if (mode === "unlimited") {
			onChange({ ...current, max: null, max_percentage: null });
		} else if (mode === "absolute") {
			onChange({ ...current, max: 0, max_percentage: null });
		} else {
			onChange({ ...current, max: null, max_percentage: 50 });
		}
	};

	return (
		<AreaCheckbox
			title={title}
			tooltip={tooltip}
			checked={hasRollover}
			disabled={disabled}
			onCheckedChange={(checked) => {
				if (checked) {
					if (onEnable) onEnable();
					else onChange({ ...DEFAULT_ROLLOVER_CONFIG });
				} else {
					onChange(null);
				}
			}}
		>
			<div className="space-y-4 w-xs max-w-full">
				<div className="space-y-2 w-full">
					<FormLabel>Maximum rollover</FormLabel>
					<div className="flex items-center gap-2">
						<Select
							value={maxMode}
							onValueChange={(v) => handleMaxModeChange(v as MaxMode)}
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
								value={rollover?.max === 0 ? "" : (rollover?.max ?? "")}
								className="flex-1"
								placeholder="e.g. 100 credits"
								onChange={(e) => {
									const v = e.target.value;
									const numValue = v === "" ? 0 : parseInt(v) || 0;
									setRolloverConfigKey("max", numValue);
								}}
								onClick={(e) => e.stopPropagation()}
							/>
						)}

						{maxMode === "percentage" && (
							<div className="flex items-center gap-1 flex-1">
								<Input
									type="number"
									value={rollover?.max_percentage ?? ""}
									className="flex-1"
									placeholder="e.g. 50"
									onChange={(e) => {
										const v = e.target.value;
										// Empty input → fall back to the minimum valid percentage (1).
										// max_percentage must be > 0 and <= 100 per backend validation,
										// so coercing empty to 0 would produce an unsaveable config.
										const parsed = v === "" ? 1 : parseInt(v) || 1;
										setRolloverConfigKey(
											"max_percentage",
											Math.min(100, Math.max(1, parsed)),
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
									const v = e.target.value;
									const numValue = v === "" ? 0 : parseInt(v) || 0;
									setRolloverConfigKey("length", numValue);
								}}
								className="w-16"
								placeholder="e.g. 1 month"
								onClick={(e) => e.stopPropagation()}
							/>
						)}
						<Select
							value={rollover?.duration}
							onValueChange={(v) => {
								setRolloverConfigKey(
									"duration",
									v as RolloverExpiryDurationType,
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
