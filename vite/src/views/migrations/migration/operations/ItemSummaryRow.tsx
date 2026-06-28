import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { migrationItemToProductItem } from "../shared/migrationItemUtils";

export function ItemSummaryRow({
	item,
	onClick,
}: {
	item: Record<string, unknown>;
	onClick?: () => void;
}) {
	const { features } = useFeaturesQuery();
	const productItem = migrationItemToProductItem(item, features);

	const content = (
		<PlanItemLabel item={productItem} unnamedText="Unconfigured" />
	);

	const baseClass =
		"flex items-center gap-2 h-8 px-3 w-full select-none rounded-xl text-left input-base";

	if (!onClick) {
		return <div className={baseClass}>{content}</div>;
	}

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(baseClass, "cursor-pointer input-state-open-tiny")}
		>
			{content}
		</button>
	);
}
