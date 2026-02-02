import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@/components/v2/cards/Card";
import { cn } from "@/lib/utils";
import { PreviewCheckoutButton } from "./PreviewCheckoutButton";
import { PreviewFeatureRow } from "./PreviewFeatureRow";
import { PreviewPlanHeader } from "./PreviewPlanHeader";
import type { PreviewProduct } from "./previewTypes";

interface PreviewPlanCardProps {
	product: PreviewProduct;
	previewApiKey?: string;
	isSyncing: boolean;
	isChanged?: boolean;
}

export function PreviewPlanCard({
	product,
	previewApiKey,
	isSyncing,
	isChanged = false,
}: PreviewPlanCardProps) {
	return (
		<Card
			className={cn(
				"w-[270px] bg-interactive-secondary dark:bg-background flex flex-col gap-0 rounded-xl",
				isChanged &&
					"ring-2 ring-yellow-400/70 ring-offset-2 ring-offset-background",
			)}
		>
			<CardHeader className="">
				<PreviewPlanHeader product={product} />
			</CardHeader>

			<CardContent className="pt-1 flex-1">
				{product.items.length > 0 && (
					<div className="space-y-1.5">
						{product.items.map((item, index) => (
							<PreviewFeatureRow
								key={`${item.featureId}-${index}`}
								item={item}
							/>
						))}
					</div>
				)}
			</CardContent>

			{product.basePrice.type !== "free" && (
				<CardFooter className="pt-3">
					<PreviewCheckoutButton
						productId={product.id}
						previewApiKey={previewApiKey}
						isSyncing={isSyncing}
					/>
				</CardFooter>
			)}
		</Card>
	);
}
