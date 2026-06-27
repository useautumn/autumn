import { Card, CardContent, CopyButton, IconButton } from "@autumn/ui";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import type { PlanVariant } from "@/services/products/ProductService";
import { pushPage } from "@/utils/genUtils";
import { VariantPrice } from "./VariantPrice";

const ID_CHIP_INNER_CLASS = "max-w-40 text-tiny-id truncate !font-normal";

export function VariantPlanCard({ variant }: { variant: PlanVariant }) {
	const navigate = useNavigate();

	return (
		<Card className="min-w-sm max-w-xl mx-4 w-full !rounded-2xl bg-background">
			<CardContent className="space-y-4 px-5">
				<div className="flex items-center justify-between gap-2">
					<div className="truncate text-base font-medium text-foreground">
						{variant.name}
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<CopyButton
							className="text-tertiary-foreground"
							innerClassName={ID_CHIP_INNER_CLASS}
							size="mini"
							text={variant.id}
						/>
						<IconButton
							aria-label={`Go to ${variant.name}`}
							icon={<ArrowRightIcon size={14} />}
							iconOrientation="center"
							onClick={() =>
								pushPage({
									navigate,
									path: `/products/${variant.id}`,
									preserveParams: false,
								})
							}
							size="mini"
							variant="secondary"
						/>
					</div>
				</div>

				<VariantPrice variant={variant} />

				<ItemChangeList itemChanges={variant.item_changes ?? []} />
			</CardContent>
		</Card>
	);
}
