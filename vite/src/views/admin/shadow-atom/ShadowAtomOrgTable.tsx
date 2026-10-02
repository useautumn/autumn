import { cn } from "@autumn/ui/lib/utils";
import {
	LIST_EMPTY,
	LIST_FRAME,
	ROW_HEADER_LAYOUT,
} from "../edge-config/rolloutRowStyles";
import { ShadowAtomAddOrgForm } from "./ShadowAtomAddOrgForm";
import { ORG_TABLE_COLUMNS, ShadowAtomOrgRow } from "./ShadowAtomOrgRow";
import { ShadowAtomSecret } from "./ShadowAtomSecret";
import { orgLabel } from "./shadowAtomNames";
import type { ShadowAtomEnvView, ShadowAtomNames } from "./shadowAtomTypes";

const HEADERS = ["Org", "Percent", "Status", ""];

/** The orgs on the env's shadow Atom, each with the share of its customers pushed there and shadowed. */
export const ShadowAtomOrgTable = ({
	envConfig,
	names,
	issued,
	onAdd,
	onSetPercent,
	onRemove,
	isAdding,
	isBusy,
}: {
	envConfig: ShadowAtomEnvView;
	names: ShadowAtomNames;
	issued: { orgId: string; token: string } | null;
	onAdd: ({
		orgId,
		percent,
	}: {
		orgId: string;
		percent: number;
	}) => Promise<boolean>;
	onSetPercent: ({
		orgId,
		percent,
	}: {
		orgId: string;
		percent: number;
	}) => void;
	onRemove: ({ orgId }: { orgId: string }) => void;
	isAdding: boolean;
	/** Any add, percent change or remove in flight: every control waits for it. */
	isBusy: boolean;
}) => {
	const orgs = Object.entries(envConfig.orgs);
	const isReady = Boolean(envConfig.endpointUrl && envConfig.hasAdminToken);

	return (
		<div className="flex flex-col gap-2">
			<div className={LIST_FRAME}>
				<div className={cn(ROW_HEADER_LAYOUT, ORG_TABLE_COLUMNS)}>
					{HEADERS.map((header) => (
						<span key={header}>{header}</span>
					))}
				</div>
				{orgs.length === 0 && (
					<p className={LIST_EMPTY}>No org is on the shadow Atom.</p>
				)}
				{orgs.map(([orgId, { percent }]) => (
					<ShadowAtomOrgRow
						key={orgId}
						{...orgLabel({ names, orgId })}
						percent={percent}
						onSetPercent={(next) => onSetPercent({ orgId, percent: next })}
						onRemove={() => onRemove({ orgId })}
						disabled={isBusy || !isReady}
					/>
				))}
			</div>
			{issued && (
				<ShadowAtomSecret
					label={`Token for ${orgLabel({ names, orgId: issued.orgId }).title}`}
					value={issued.token}
					hint="Shown once. Adding the org again rotates it."
				/>
			)}
			{!isReady && (
				<p className="text-xs text-tertiary-foreground">
					Adding and changing orgs need a ready shadow Atom: its endpoint and
					admin token.
				</p>
			)}
			<ShadowAtomAddOrgForm
				onAdd={onAdd}
				isSaving={isAdding}
				disabled={isBusy || !isReady}
			/>
		</div>
	);
};
