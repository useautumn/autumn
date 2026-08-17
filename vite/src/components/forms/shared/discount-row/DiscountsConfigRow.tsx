import { IconButton } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import type { FormDiscount } from "@/components/forms/attach-v2/utils/discountUtils";
import { ConfigRow } from "@/components/forms/shared/advanced-section";
import { DiscountRow } from "./DiscountRow";

export function DiscountsConfigRow({
	discounts,
	description,
	productId,
	onAdd,
	onUpdate,
	onRemove,
}: {
	discounts: FormDiscount[];
	description: string;
	productId: string | undefined;
	onAdd: () => void;
	onUpdate: (params: { index: number; rewardId: string }) => void;
	onRemove: (params: { index: number }) => void;
}) {
	return (
		<ConfigRow
			title="Discounts"
			description={description}
			action={
				<IconButton
					variant="muted"
					size="sm"
					onClick={onAdd}
					icon={<PlusIcon size={12} />}
					className="text-tertiary-foreground"
				>
					Add
				</IconButton>
			}
		>
			{discounts.length > 0 && (
				<div className="space-y-2">
					<AnimatePresence initial={false} mode="popLayout">
						{discounts.map((discount, index) => (
							<motion.div
								key={discount._id}
								initial={{ opacity: 0, scale: 0.95 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.95 }}
								transition={{ duration: 0.15 }}
							>
								<DiscountRow
									discounts={discounts}
									index={index}
									productId={productId}
									onUpdate={({ rewardId }) => onUpdate({ index, rewardId })}
									onRemove={() => onRemove({ index })}
								/>
							</motion.div>
						))}
					</AnimatePresence>
				</div>
			)}
		</ConfigRow>
	);
}
