import type { ProductV2 } from "@autumn/shared";
import {
	PencilSimpleIcon,
	SquareSplitHorizontalIcon,
} from "@phosphor-icons/react";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import CreatePlanDialog from "@/views/products/products/components/CreatePlanDialog";

interface PlaygroundToolbarProps {
	playgroundMode: "edit" | "preview";
	setPlaygroundMode: (mode: "edit" | "preview") => void;
	selectedProductId: string;
	products: ProductV2[];
	onPlanSelect: (planId: string) => void;
	onCreatePlanSuccess: (newProduct: ProductV2) => Promise<void>;
}

export const PlaygroundToolbar = ({
	playgroundMode,
	setPlaygroundMode,
	selectedProductId,
	products,
	onPlanSelect,
	onCreatePlanSuccess,
}: PlaygroundToolbarProps) => {
	return (
		<div className="flex gap-2 items-center justify-between">
			<GroupedTabButton
				value={playgroundMode}
				onValueChange={(val) => setPlaygroundMode(val as "edit" | "preview")}
				options={[
					{
						value: "edit",
						label: "Edit Mode",
						icon: <PencilSimpleIcon className="size-[14px]" weight="regular" />,
					},
					{
						value: "preview",
						label: "Preview Mode",
						icon: (
							<SquareSplitHorizontalIcon
								className="size-[14px]"
								weight="regular"
							/>
						),
					},
				]}
			/>
			<div className="flex gap-2 items-center">
				<Select value={selectedProductId} onValueChange={onPlanSelect}>
					<SelectTrigger className="!h-6 text-body px-2 py-1 min-w-0 max-w-[120px] overflow-x-hidden text-ellipsis whitespace-nowrap">
						<SelectValue placeholder="Select plan" className="truncate" />
					</SelectTrigger>
					<SelectContent>
						{products.map((prod) => (
							<SelectItem key={prod.id} value={prod.id} className="text-body">
								<span className="truncate block max-w-[100px]">
									{prod.name}
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<CreatePlanDialog
					onSuccess={onCreatePlanSuccess}
					size="sm"
					buttonClassName="!h-6 !px-2 text-body"
				/>
			</div>
		</div>
	);
};
