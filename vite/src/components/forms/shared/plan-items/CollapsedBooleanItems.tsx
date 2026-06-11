import type { ProductItem } from "@autumn/shared";
import { type ReactNode, useState } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";
import { cn } from "@/lib/utils";
import { getItemId } from "@/utils/product/productItemUtils";
import { motion } from "motion/react";

interface CollapsedBooleanItemsProps {
	items: ProductItem[];
	renderItem: (item: ProductItem, index: number) => ReactNode;
	triggerClassName?: string;
}

export function CollapsedBooleanItems({
	items,
	renderItem,
	triggerClassName,
}: CollapsedBooleanItemsProps) {
	const [value, setValue] = useState<string[]>([]);

	if (items.length === 0) return null;

	const isExpanded = value.includes("boolean-flags");
	const label = isExpanded
		? "Hide"
		: `${items.length} more`;

	return (
		<Accordion
			value={value}
			onValueChange={setValue}
			className="w-full"
		>
			<AccordionItem value="boolean-flags" className="border-none">
				<AccordionTrigger
						className={cn(
							"py-2 px-3 rounded-xl text-tertiary-foreground hover:bg-interative-secondary hover:no-underline",
							triggerClassName,
						)}
					>
					<span className="text-sm font-normal">
						{label} boolean flag{items.length === 1 ? "" : "s"}
					</span>
				</AccordionTrigger>
				<AccordionContent className="pb-1.5 pt-1.5 px-0">
					<div className="flex flex-col gap-1.5">
					{items.map((item, index) => (
						<motion.div
							key={getItemId({ item, itemIndex: index })}
							layout="position"
							transition={{ layout: LAYOUT_TRANSITION }}
						>
							{renderItem(item, index)}
						</motion.div>
					))}
					</div>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
