import { ToggleButton } from "@/components/general/ToggleButton";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { Input } from "@/components/ui/input";
import { ProductItem, RolloverConfig, RolloverDuration } from "@autumn/shared";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export const RolloverConfigView = ({
	item,
	setItem,
	showRolloverConfig,
}: {
	item: ProductItem;
	setItem: (item: any) => void;
	showRolloverConfig: boolean;
}) => {
	const defaultRollover: RolloverConfig = {
		duration: RolloverDuration.Month,
		length: 1,
		max: null,
	};

	const setRolloverConfigKey = (key: keyof RolloverConfig, value: any) => {
		setItem({
			...item,
			config: {
				...(item.config || {}),
				rollover: {
					...(item.config?.rollover || {}),
					[key]: value,
				},
			},
		});
	};

	const setRolloverConfig = (rollover: RolloverConfig | null) => {
		setItem({
			...item,
			config: {
				...(item.config || {}),
				rollover: rollover,
			},
		});
	};

	const rollover = item.config?.rollover as RolloverConfig;

	return (
		<div className="relative flex flex-col gap-3">
			<ToggleButton
				value={item.config?.rollover != null}
				setValue={() => {
					if (item.config?.rollover != null) {
						setRolloverConfig(null);
					} else {
						setItem({
							...item,
							reset_usage_when_enabled: true,
							config: {
								...(item.config || {}),
								rollover: defaultRollover,
							},
						});
					}
				}}
				buttonText="Enable rollovers"
				infoContent="Rollovers carry unused credits to the next billing cycle. Set a maximum rollover amount and specify how many cycles before resetting."
				className="text-t3 h-fit"
				disabled={!showRolloverConfig}
			/>

			{item.config?.rollover && showRolloverConfig && (
				<div className="flex gap-3 w-full">
					<div className="w-6/12 flex gap-1 items-center">
						<p className="text-t3 w-16">up to</p>
						<Input
							value={rollover.max === null ? "Unlimited" : rollover.max}
							className="w-full"
							placeholder="Max"
							disabled={rollover.max === null}
							onChange={(e) => {
								setRolloverConfigKey("max", e.target.value);
							}}
						/>
						<ToggleDisplayButton
							label="Unlimited"
							show={rollover.max === null}
							className="h-8"
							onClick={() => {
								if (rollover.max === null) {
									setRolloverConfigKey("max", 0);
								} else {
									setRolloverConfigKey("max", null);
								}
							}}
						>
							♾️
						</ToggleDisplayButton>
					</div>

					<div className="w-6/12 flex gap-1">
						{rollover.duration === RolloverDuration.Month && (
							<Input
								value={rollover.length || ""}
								onChange={(e) => {
									setRolloverConfigKey("length", e.target.value);
								}}
								className="w-14"
							/>
						)}
						<Select
							value={rollover.duration}
							onValueChange={(value) => {
								setRolloverConfigKey("duration", value as RolloverDuration);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a duration" />
							</SelectTrigger>
							<SelectContent>
								{Object.values(RolloverDuration).map((duration) => (
									<SelectItem key={duration} value={duration}>
										{duration}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			)}
		</div>
	);
};
