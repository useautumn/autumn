import type { ProductV2 } from "@autumn/shared";
import { PencilIcon, Trash2 } from "lucide-react";
import { CopyableSpan } from "@/components/general/CopyablePre";
import { Card, CardHeader } from "@/components/ui/card";

export default function PlanCard({ product }: { product: ProductV2 }) {
	return (
		<Card className="w-[95%] mx-auto">
			<CardHeader>
				<div className="flex flex-row items-center justify-between gap-2 w-full whitespace-nowrap">
					<div className="flex flex-row items-baseline gap-2">
						<span className="text-lg font-medium w-fit whitespace-nowrap">
							{product.name}
						</span>
						<CopyableSpan text={product.id} />
					</div>
					<div className="flex flex-row items-center gap-2">
                    <PencilIcon />
                    <Trash2/>
                    </div>
				</div>
			</CardHeader>
		</Card>
	);
}
