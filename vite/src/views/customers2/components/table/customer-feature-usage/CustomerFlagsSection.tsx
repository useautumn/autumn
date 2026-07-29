import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { SectionTag } from "@autumn/ui";
import { CheckCircleIcon } from "@phosphor-icons/react";

export function CustomerFlagsSection({
	booleanEnts,
}: {
	booleanEnts: FullCusEntWithFullCusProduct[];
}) {
	if (booleanEnts.length === 0) return null;

	return (
		<div className="flex flex-col">
			<SectionTag>Flags</SectionTag>
			<div className="flex flex-wrap gap-2">
				{booleanEnts.map((ent) => (
					<div
						key={ent.entitlement.feature.id}
						className="text-sm text-muted-foreground bg-interactive-secondary border h-10 flex items-center px-4 rounded-lg"
					>
						<span>{ent.entitlement.feature.name}</span>
					</div>
				))}
			</div>
		</div>
	);
}
