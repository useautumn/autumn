import { type Feature, FeatureType, ProductItemType } from "@autumn/shared";
import { PlusIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getItemType } from "@/utils/product/productItemUtils";
import { FeatureTypeBadge } from "@/views/products/features/components/FeatureTypeBadge";
import { useProductContext } from "../../ProductContext";
import { useProductItemContext } from "../ProductItemContext";
import { CreateItemStep } from "../utils/CreateItemStep";

export const SelectItemFeature = () => {
	const { features } = useFeaturesQuery();
	const { item, setItem, isUpdate, stepState } = useProductItemContext();
	const [open, setOpen] = useState(false);
	const itemType = getItemType(item);

	return (
		<div className="flex items-center gap-2 w-full">
			<Select
				open={open}
				onOpenChange={setOpen}
				value={item.feature_id || ""}
				onValueChange={(value) => {
					setItem({ ...item, feature_id: value });
				}}
				disabled={isUpdate}
			>
				<SelectTrigger className="overflow-hidden">
					<SelectValue placeholder="Select a feature" />
				</SelectTrigger>
				<SelectContent>
					{features
						.filter((feature: Feature) => {
							if (feature.archived && feature.id !== item.feature_id)
								return false;
							if (itemType === ProductItemType.FeaturePrice) {
								return feature.type !== FeatureType.Boolean;
							}
							return true;
						})
						.map((feature: Feature) => (
							<SelectItem key={feature.id} value={feature.id!}>
								<div className="flex gap-2 items-center max-w-sm">
									<span className="truncate">{feature.name}</span>
									<FeatureTypeBadge {...feature} />
								</div>
							</SelectItem>
						))}
					<Button
						className="flex w-full font-medium bg-white shadow-none text-primary hover:bg-stone-200"
						onClick={(e) => {
							e.preventDefault();
							stepState.pushStep(CreateItemStep.CreateFeature);
						}}
					>
						<PlusIcon className="w-3 h-3 mr-2" />
						Create new feature
					</Button>
				</SelectContent>
			</Select>
			{!isUpdate && item.feature_id && (
				<Button
					isIcon
					size="sm"
					variant="ghost"
					className="w-fit text-t3"
					onClick={() => {
						setItem({
							...item,
							feature_id: null,
							included_usage: null,
							feature_type: null,
							tiers: null,
							price: null,
							// price: item.tiers?.[0]?.amount || 0,
						});
						// setShow({ ...show, feature: false });
					}}
				>
					<X size={12} className="text-t3" />
				</Button>
			)}
		</div>
	);
};
