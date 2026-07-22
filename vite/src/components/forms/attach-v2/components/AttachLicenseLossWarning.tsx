import type { FullCustomer } from "@autumn/shared";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@autumn/ui";
import { CaretDownIcon, UserIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useLicenseBalancesQuery } from "@/hooks/queries/useLicenseBalancesQuery";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useAttachFormContext } from "../context/AttachFormProvider";

export function AttachLicenseLossWarning() {
	const { customerId, product, formValues, previewDiff } =
		useAttachFormContext();
	const [open, setOpen] = useState(false);

	const { planLicenses } = usePlanLicensesQuery(product?.id);
	const { assignments } = useLicenseBalancesQuery({ customerId });
	const { customer } = useCusQuery();

	const outgoingLicenseIds = useMemo(
		() =>
			new Set(
				previewDiff.outgoingLicenses.map((license) => license.license_plan_id),
			),
		[previewDiff.outgoingLicenses],
	);

	// Only warn on complete removal: the incoming plan must offer no licenses at all.
	const incomingLicenseCount =
		planLicenses.length + (formValues.addLicenses?.length ?? 0);

	const affectedEntityLabels = useMemo(() => {
		if (incomingLicenseCount > 0 || outgoingLicenseIds.size === 0) return [];

		const entityById = new Map(
			((customer as FullCustomer | null)?.entities ?? []).map((entity) => [
				entity.id,
				entity,
			]),
		);

		const labelById = new Map<string, string>();
		for (const assignment of assignments) {
			if (!outgoingLicenseIds.has(assignment.license_plan_id)) continue;
			if (labelById.has(assignment.entity_id)) continue;
			const entity = entityById.get(assignment.entity_id);
			labelById.set(
				assignment.entity_id,
				entity?.name || entity?.id || assignment.entity_id,
			);
		}
		return [...labelById].map(([id, label]) => ({ id, label }));
	}, [incomingLicenseCount, outgoingLicenseIds, assignments, customer]);

	const entityCount = affectedEntityLabels.length;
	if (entityCount === 0) return null;

	return (
		<SheetSection withSeparator={false} className="pb-0">
			<InfoBox variant="warning">
				<Collapsible onOpenChange={setOpen} open={open}>
					<span>
						<span className="font-medium">
							{entityCount} {entityCount === 1 ? "entity" : "entities"}
						</span>{" "}
						will lose {entityCount === 1 ? "its" : "their"} licenses when this
						plan change takes effect.{" "}
						<CollapsibleTrigger className="inline-flex items-center gap-0.5 align-middle underline underline-offset-3 hover:opacity-80">
							View entities
							<CaretDownIcon
								className={`size-3 transition-transform ${open ? "" : "-rotate-90"}`}
								weight="bold"
							/>
						</CollapsibleTrigger>
					</span>
					<CollapsibleContent>
						<ul className="mt-1.5 flex flex-col gap-0.5">
							{affectedEntityLabels.map((entity) => (
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
