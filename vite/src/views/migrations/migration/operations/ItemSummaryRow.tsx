import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import type { RateChange } from "@/utils/product/featureOverrideRates";
import { ItemRateChangeRow } from "../shared/ItemRateChangeRow";
import { migrationItemToProductItem } from "../shared/migrationItemUtils";

const NO_RATE_CHANGES: RateChange[] = [];

export function ItemSummaryRow({
	item,
	onClick,
	changes = NO_RATE_CHANGES,
}: {
	item: Record<string, unknown>;
	onClick?: () => void;
	changes?: RateChange[];
}) {
	const { features } = useFeaturesQuery();
	const productItem = migrationItemToProductItem(item, features);

	return (
		<ItemRateChangeRow changes={changes} compact onClick={onClick}>
			<PlanItemLabel item={productItem} unnamedText="Unconfigured" />
		</ItemRateChangeRow>
	);
}
