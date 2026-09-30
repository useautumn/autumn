import { cn } from "@autumn/ui/lib/utils";
import { ORG_ROW_COLUMNS, RolloutOrgRow } from "./RolloutOrgRow";
import { LIST_EMPTY, LIST_FRAME, ROW_HEADER_LAYOUT } from "./rolloutRowStyles";
import type { RolloutOrg, RolloutPercent } from "./rolloutTypes";

/** Every org override, or the note that there are none. */
export const RolloutOrgList = ({
	orgOverrides,
	orgsById,
	settleMs,
	onApply,
	onRemove,
	isSaving,
}: {
	orgOverrides: [string, RolloutPercent][];
	orgsById: Record<string, RolloutOrg>;
	settleMs: number;
	onApply: ({ orgId, percent }: { orgId: string; percent: number }) => void;
	onRemove: ({ orgId, name }: { orgId: string; name: string }) => void;
	isSaving: boolean;
}) => (
	<div className={LIST_FRAME}>
		{orgOverrides.length === 0 ? (
			<div className={LIST_EMPTY}>
				No overrides. Every org follows the global percent.
			</div>
		) : (
			<>
				<div className={cn(ROW_HEADER_LAYOUT, ORG_ROW_COLUMNS)}>
					<span>Org</span>
					<span>On the worker</span>
					<span>Status</span>
					<span />
				</div>
				{orgOverrides.map(([orgId, rollout]) => (
					<RolloutOrgRow
						key={orgId}
						orgId={orgId}
						org={orgsById[orgId]}
						rollout={rollout}
						settleMs={settleMs}
						onApply={({ percent }) => onApply({ orgId, percent })}
						onRemove={() =>
							onRemove({ orgId, name: orgsById[orgId]?.name ?? orgId })
						}
						isSaving={isSaving}
					/>
				))}
			</>
		)}
	</div>
);
