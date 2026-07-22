import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@autumn/ui";
import { CaretDownIcon, UserIcon } from "@phosphor-icons/react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useLicenseLossEntities } from "../hooks/useLicenseLossEntities";

export function AttachLicenseLossWarning() {
	const entities = useLicenseLossEntities();
	if (entities.length === 0) return null;

	const isSingle = entities.length === 1;

	return (
		<SheetSection withSeparator={false} className="pb-0">
			<InfoBox variant="warning">
				<Collapsible>
					<span>
						<span className="font-medium">
							{entities.length} {isSingle ? "entity" : "entities"}
						</span>{" "}
						will lose {isSingle ? "its" : "their"} licenses when this plan
						change takes effect.{" "}
						<CollapsibleTrigger className="group inline-flex items-center gap-0.5 align-middle underline underline-offset-3 hover:opacity-80">
							View entities
							<CaretDownIcon
								className="size-3 -rotate-90 transition-transform group-data-[panel-open]:rotate-0"
								weight="bold"
							/>
						</CollapsibleTrigger>
					</span>
					<CollapsibleContent>
						<ul className="mt-1.5 flex flex-col gap-0.5">
							{entities.map((entity) => (
								<li
									className="flex items-center gap-1.5 font-medium"
									key={entity.id}
								>
									<UserIcon className="shrink-0 opacity-70" size={12} />
									<span className="truncate">{entity.label}</span>
								</li>
							))}
						</ul>
					</CollapsibleContent>
				</Collapsible>
			</InfoBox>
		</SheetSection>
	);
}
