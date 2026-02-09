import { getFeatureName } from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	useIsAttachingProduct,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { cn } from "@/lib/utils";

export function AttachProductSheetTrigger() {
	const { setSheet, closeSheet } = useSheetStore();
	const isAttachingProduct = useIsAttachingProduct();
	const { entity } = useEntity();
	const features = useFeaturesQuery();
	const sheetType = useSheetStore((s) => s.type);

	const feature = features.features.find((f) => f.id === entity?.feature_id);

	const handleClick = () => {
		setSheet({ type: "attach-product-v2" });
	};
	return (
		<Button
			variant="primary"
			size="mini"
			className={cn(
				"gap-1 font-medium",
				isAttachingProduct && "z-90 opacity-70",
			)}
			onClick={handleClick}
		>
			<PlusIcon className="size-3.5" />
			Attach Plan{" "}
			{entity
				? `to ${getFeatureName({ feature, plural: false, capitalize: false })}`
				: ""}
		</Button>
	);
}
