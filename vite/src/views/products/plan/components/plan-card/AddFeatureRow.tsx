import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { useCurrentItem } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";
import { useOpenAddFeatureSheet } from "../../hooks/useOpenAddFeatureSheet";

interface AddFeatureRowProps {
	disabled?: boolean;
	onClick?: () => void;
}

export const AddFeatureRow = ({ disabled }: AddFeatureRowProps) => {
	const item = useCurrentItem();
	const openAddFeatureSheet = useOpenAddFeatureSheet();

	return (
		<Button
			variant="dotted"
			className="group !rounded-xl !bg-transparent w-full !h-9 !border-dashed !text-primary [&_svg]:text-primary hover:!border-primary !border-primary/50 active:!border-primary focus-visible:!bg-primary/5 focus-visible:!border-dashed [data-state='open']:!bg-primary/5 disabled:relative z-95 hover:relative"
			disabled={disabled}
			onClick={() => {
				if (!checkItemIsValid(item!)) return;
				openAddFeatureSheet();
			}}
			aria-label="Add new feature"
		>
			<PlusIcon className="size-3 !text-primary" weight="bold" />
			<span className="!text-primary">Add Feature to Plan</span>
		</Button>
	);
};
