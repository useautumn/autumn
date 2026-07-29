import { Switch, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";

function ToggleSwitch({
	checked,
	onCheckedChange,
	disabledReason,
}: {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabledReason?: string;
}) {
	const toggle = (
		<Switch
			checked={checked}
			disabled={!!disabledReason}
			onCheckedChange={onCheckedChange}
		/>
	);

	if (!disabledReason) return toggle;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div>{toggle}</div>
			</TooltipTrigger>
			<TooltipContent side="left" className="max-w-60">
				{disabledReason}
			</TooltipContent>
		</Tooltip>
	);
}

export const AdditionalOptions = ({
	withSeparator = false,
}: {
	withSeparator?: boolean;
}) => {
	const { product, setProduct } = useProduct();

	if (!product.planType) return null;

	const addOnDisabledReason = product.is_default
		? "Cannot mark as add-on while auto-enable is active"
		: undefined;

	return (
		<SheetSection withSeparator={withSeparator}>
			<div className="space-y-5">
				{(product.planType === "free" ||
					product.free_trial?.card_required === false ||
					product.is_default) && (
					<ConfigRow
						title="Auto-enable plan"
						description="This plan will be enabled automatically for new customers"
						action={
							<ToggleSwitch
								checked={product.is_default}
								disabledReason={
									product.is_add_on
										? "Cannot auto-enable an add-on plan"
										: undefined
								}
								onCheckedChange={(checked) =>
									setProduct({ ...product, is_default: checked })
								}
							/>
						}
					/>
				)}
				<ConfigRow
					title="Add-on plan"
					description="This plan can be purchased alongside base plans as an add-on"
					action={
						<ToggleSwitch
							checked={product.is_add_on}
							disabledReason={addOnDisabledReason}
							onCheckedChange={(checked) =>
								setProduct({
									...product,
									is_add_on: checked,
									is_default: checked ? false : product.is_default,
								})
							}
						/>
					}
				/>
			</div>
		</SheetSection>
	);
};
