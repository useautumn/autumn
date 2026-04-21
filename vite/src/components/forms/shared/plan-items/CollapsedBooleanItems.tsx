import type { ProductItem } from "@autumn/shared";
import { type ReactNode, useState } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";
import { motion } from "motion/react";

interface CollapsedBooleanItemsProps {
	items: ProductItem[];
	renderItem: (item: ProductItem, index: number) => ReactNode;
}

export function CollapsedBooleanItems({
	items,
	renderItem,
}: CollapsedBooleanItemsProps) {
	const [value, setValue] = useState("");

	if (items.length === 0) return null;

	const isExpanded = value === "boolean-flags";
	const label = isExpanded
		? "Hide"
		: `${items.length} more`;

	return (
		<Accordion
			type="single"
			collapsible
			value={value}
			onValueChange={setValue}
			className="w-full"
		>
			<AccordionItem value="boolean-flags" className="border-none">
				<AccordionTrigger className="py-2 px-3 rounded-xl text-t3 hover:bg-interative-secondary hover:no-underline">
					<span className="text-sm font-normal">
						{label} boolean flag{items.length === 1 ? "" : "s"}
					</span>
				</AccordionTrigger>
				<AccordionContent className="pb-1.5 pt-1.5 px-0">
					<div className="flex flex-col gap-1.5">
						{items.map((item, index) => (
							<motion.div
								key={item.feature_id ?? index}
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
