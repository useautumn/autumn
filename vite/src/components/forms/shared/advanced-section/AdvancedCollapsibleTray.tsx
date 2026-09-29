import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@autumn/ui";
import type { ReactNode } from "react";
import { AdvancedSectionTitle } from "./AdvancedSectionTitle";
import { AdvancedTray } from "./AdvancedTray";

export function AdvancedCollapsibleTray({
	value,
	title,
	children,
}: {
	value: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<Accordion>
			<AccordionItem value={value}>
				<AccordionTrigger className="h-[42px] items-center rounded-none py-0 hover:no-underline [&>svg]:translate-y-0">
					<AdvancedSectionTitle title={title} />
				</AccordionTrigger>
				<AccordionContent className="pb-0">
					<AdvancedTray>{children}</AdvancedTray>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
