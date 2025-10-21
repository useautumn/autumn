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
import { useOnboarding3QueryState } from "../../hooks/useOnboarding3QueryState";
import { useOnboardingStore } from "../../store/useOnboardingStore";

export const PlaygroundToolbar = () => {
	// Get products from query
	const { products } = useProductsQuery();

	// Get current product and playground mode from stores
	const product = useProductStore((s) => s.product);
	const playgroundMode = useOnboardingStore((s) => s.playgroundMode);

	// Get query state setters to update URL
	const { setQueryStates } = useOnboarding3QueryState();

	// Get handlers from store
	const handlePlanSelect = useOnboardingStore((s) => s.handlePlanSelect);
	const onCreatePlanSuccess = useOnboardingStore((s) => s.onCreatePlanSuccess);
	return (
		<div className="flex gap-2 items-center justify-between mt-4">
			<GroupedTabButton
				value={playgroundMode}
				onValueChange={(val) => {
					// Update query param, which will sync to store
					setQueryStates({ m: val === "edit" ? "e" : "p" });
				}}
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
			{playgroundMode === "edit" && (
				<div className="flex gap-2 items-center">
					{products.filter((p) => !p.archived).length > 1 && (
						<Select
							value={product?.id}
							onValueChange={(id) => handlePlanSelect?.(id)}
						>
							<SelectTrigger className="!h-6 text-body px-2 py-1 min-w-0 max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">
								<SelectValue
									placeholder="Select plan"
									className="truncate"
								/>
							</SelectTrigger>
							<SelectContent>
								{products
									.filter((p) => !p.archived)
									.map((prod) => (
										<SelectItem
											key={prod.id}
											value={prod.id}
											className="text-body"
										>
											<span className="truncate block max-w-[100px]">
												{prod.name}
											</span>
										</SelectItem>
									))}
							</SelectContent>
						</Select>
					)}
					<CreatePlanDialog
						onSuccess={onCreatePlanSuccess || undefined}
						size="sm"
						buttonClassName="!h-6 !px-2 text-body"
					/>
				</div>
			)}
		</div>
	);
};
