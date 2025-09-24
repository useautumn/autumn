import type { ProductV2 } from "@autumn/shared";
import { mapToProductV3 } from "@autumn/shared";
import { Card, CardContent } from "@/components/v2/cards/Card";
import { useEnv } from "@/utils/envUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { PlanCardHeader } from "./PlanCardHeader";
import { PlanFeatureList } from "./PlanFeatureList";

export default function PlanCard({ product }: { product: ProductV2 }) {
	const env = useEnv();
	const { editingState } = useProductContext();
	const productV3 = mapToProductV3({ product, env });

	return (
		<Card className="min-w-sm w-[70%] max-w-xl mx-4 bg-card">
			<PlanCardHeader />
			<CardContent>
				<PlanFeatureList />
			</CardContent>
		</Card>
	);
}
