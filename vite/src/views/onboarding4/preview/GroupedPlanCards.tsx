import { SectionTag } from "@/components/v2/badges/SectionTag";
import { PreviewPlanCard } from "./PreviewPlanCard";
import { groupPreviewProducts, type PreviewProduct } from "./previewTypes";

interface GroupedPlanCardsProps {
	products: PreviewProduct[];
	previewApiKey?: string;
	isSyncing: boolean;
	changedProductIds: Set<string>;
}

export function GroupedPlanCards({
	products,
	previewApiKey,
	isSyncing,
	changedProductIds,
}: GroupedPlanCardsProps) {
	const { subscriptions, addOnSubscriptions, oneTimePlans } =
		groupPreviewProducts(products);

	const renderSection = (title: string, items: PreviewProduct[]) => {
		if (items.length === 0) return null;

		return (
			<div className="flex flex-col gap-2">
				<SectionTag className="self-center">{title}</SectionTag>
				<div className="flex gap-3 flex-wrap justify-center">
					{items.map((product) => (
						<PreviewPlanCard
							key={product.id}
							product={product}
							previewApiKey={previewApiKey}
							isSyncing={isSyncing}
							isChanged={changedProductIds.has(product.id)}
						/>
					))}
				</div>
			</div>
		);
	};

	return (
		<>
			{renderSection("Subscriptions", subscriptions)}
			{renderSection("Add-on subscriptions", addOnSubscriptions)}
			{renderSection("One-off purchases", oneTimePlans)}
		</>
	);
}
