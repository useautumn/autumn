import { FeatureType } from "@autumn/shared";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useCustomer } from "autumn-js/react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";

const FeatureTestRow = ({
	label,
	usage,
	handleSend,
}: {
	label: string;
	usage?: string;
	handleSend: (value: number) => void;
}) => {
	const [value, setValue] = useState(0);

	return (
		<div className="flex flex-col gap-1 w-full">
			<label
				className="text-[13px] font-medium text-[#767676] tracking-[-0.039px]"
				htmlFor={label}
			>
				{label}
			</label>
			<div className="flex gap-2 items-end w-full">
				<Input
					type="number"
					value={value === 0 ? "" : value}
					onChange={(e) => {
						const inputValue = e.target.value;
						if (inputValue === "" || inputValue === "-") {
							setValue(0);
						} else {
							const numValue = Number(inputValue);
							if (!Number.isNaN(numValue)) {
								setValue(numValue);
							}
						}
					}}
					placeholder="Enter any amount to test"
					className="text-[13px] flex-1"
				/>
				{usage && (
					<div
						className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none
  rounded-lg group/btn transition-none w-fit bg-muted border border-transparent py-1 !px-[7px] text-tiny h-6 select-none cursor-default"
					>
						{usage}
					</div>
				)}
				<Button
					disabled={value === 0}
					onClick={() => handleSend(value)}
					variant="secondary"
					size="sm"
				>
					Send
					<ArrowRightIcon className="size-[14px]" />
				</Button>
			</div>
		</div>
	);
};

export const AvailableFeatures = ({
	onTrackSuccess,
	onFeatureUsed,
}: {
	onTrackSuccess?: (response: any) => void;
	onFeatureUsed?: (featureId: string) => void;
}) => {
	const { customer, track, refetch } = useCustomer();
	const { features } = useFeaturesQuery();

	return (
		<SheetSection title="Available features">
			<div className="flex flex-col gap-4">
				{Object.keys(customer?.features || {}).length > 0 ? (
					Object.keys(customer?.features ?? {})
						.filter(
							(x) =>
								features.find((f) => f.id === customer?.features[x].id)
									?.type !== FeatureType.Boolean,
						)
						.map((x) => (
							<FeatureTestRow
								label={
									features.find((f) => f.id === customer?.features[x].id)
										?.name || ""
								}
								usage={
									customer?.features[x].unlimited
										? "Unlimited"
										: String(customer?.features[x].balance)
								}
								key={x}
								handleSend={async (value) => {
									const featureId = customer?.features[x].id;

									// Notify parent which feature was used
									if (onFeatureUsed && featureId !== undefined) {
										onFeatureUsed(featureId);
									}

									// Track the usage
									const { data, error } = await track({
										featureId: featureId,
										value: value,
									});

									if (!error && data && onTrackSuccess) {
										onTrackSuccess(data);
									}

									// Immediately refetch customer data to update balances
									await refetch();
								}}
							/>
						))
				) : (
					<span className="text-sm text-muted-foreground">
						Your current product doesn't have any features. Try purchasing a
						product in the preview first.
					</span>
				)}
			</div>
		</SheetSection>
	);
};
