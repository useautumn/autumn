import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";

const FeatureTestRow = ({
	label,
	usage,
}: {
	label: string;
	usage?: string;
}) => (
	<div className="flex gap-2 items-end w-full">
		<div className="flex flex-col gap-1 flex-1">
			<label
				className="text-[13px] font-medium text-[#767676] tracking-[-0.039px]"
				htmlFor={label}
			>
				{label}
			</label>
			<Input
				placeholder="Enter any amount to test"
				className="text-[13px]"
				disabled
			/>
		</div>
		{usage && (
			<Button variant="muted" size="sm" disabled>
				{usage}
			</Button>
		)}
		<Button variant="secondary" size="sm" disabled>
			Send
			<ArrowRight className="size-[14px]" />
		</Button>
	</div>
);

export const AvailableFeatures = () => {
	return (
		<SheetSection title="Available features">
			<div className="flex flex-col gap-4">
				<FeatureTestRow label="Messages" usage="Used 200" />
				<FeatureTestRow label="API Tokens" />
				<FeatureTestRow label="2000 active users" />
			</div>
		</SheetSection>
	);
};
