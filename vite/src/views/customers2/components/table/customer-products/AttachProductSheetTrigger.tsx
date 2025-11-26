import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	useIsAttachingProduct,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";

export function AttachProductSheetTrigger() {
	const { setSheet, closeSheet } = useSheetStore();
	const isAttachingProduct = useIsAttachingProduct();
	const { entity } = useEntity();
	const features = useFeaturesQuery();

	const feature = features.features.find((f) => f.id === entity?.feature_id);

	const handleClick = () => {
		if (isAttachingProduct) {
			closeSheet();
		} else {
			setSheet({ type: "attach-product" });
		}
	};
	return (
		<Button
			variant="primary"
			size="mini"
			className="gap-1 font-medium"
			onClick={handleClick}
		>
			<PlusIcon className="size-3.5" />
			Attach Plan {entity ? `to ${feature?.display?.singular}` : ""}
		</Button>
	);
}
