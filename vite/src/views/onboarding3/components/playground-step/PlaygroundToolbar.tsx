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
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import CreatePlanDialog from "@/views/products/products/components/CreatePlanDialog";
import { useOnboardingStore } from "../../store/useOnboardingStore";

export const PlaygroundToolbar = () => {
	// Get products from query
	const { products } = useProductsQuery();

	// Get current product and playground mode from stores
	const product = useProductStore((s) => s.product);
	const playgroundMode = useOnboardingStore((s) => s.playgroundMode);
	const setPlaygroundMode = useOnboardingStore((s) => s.setPlaygroundMode);

	// Get handlers from store
	const handlePlanSelect = useOnboardingStore((s) => s.handlePlanSelect);
	const onCreatePlanSuccess = useOnboardingStore((s) => s.onCreatePlanSuccess);
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
				<Select
					value={product?.id}
					onValueChange={(id) => handlePlanSelect?.(id)}
				>
					<SelectTrigger className="!h-6 text-body px-2 py-1 min-w-0 max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">
						<SelectValue placeholder="Select plan" className="truncate" />
					</SelectTrigger>
					<SelectContent>
						{products?.map((prod) => (
							<SelectItem key={prod.id} value={prod.id} className="text-body">
								<span className="truncate block max-w-[100px]">
									{prod.name}
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<CreatePlanDialog
					onSuccess={onCreatePlanSuccess || undefined}
					size="sm"
					buttonClassName="!h-6 !px-2 text-body"
				/>
			</div>
		</div>
	);
};
