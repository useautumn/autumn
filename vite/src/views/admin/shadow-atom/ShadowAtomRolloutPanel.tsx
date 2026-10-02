import { RolloutFlipStatus } from "../edge-config/RolloutFlipStatus";
import { RolloutPercentForm } from "../edge-config/RolloutPercentForm";
import { LIST_EMPTY, LIST_FRAME } from "../edge-config/rolloutRowStyles";
import { ShadowAtomCustomerPinForm } from "./ShadowAtomCustomerPinForm";
import { ShadowAtomListRow } from "./ShadowAtomListRow";
import { ShadowAtomOrgPercentForm } from "./ShadowAtomOrgPercentForm";
import {
	pinCustomer,
	removeOrgPercent,
	rolloutToCustomerPins,
	setOrgPercent,
	unpinCustomer,
} from "./shadowAtomRolloutEdits";
import {
	SHADOW_ATOM_SETTLE_MS,
	type ShadowAtomRollout,
} from "./shadowAtomTypes";

const Subheading = ({ children }: { children: string }) => (
	<h3 className="text-xs font-medium text-foreground">{children}</h3>
);

/** Whom the env's shadow Atom holds: its percent, org overrides and pinned customers. Every edit saves the whole rollout. */
export const ShadowAtomRolloutPanel = ({
	rollout,
	onSave,
	isSaving,
}: {
	rollout: ShadowAtomRollout;
	/** Resolves true once saved, so a form keeps its draft when the save fails. */
	onSave: (rollout: ShadowAtomRollout) => Promise<boolean>;
	isSaving: boolean;
}) => {
	const orgOverrides = Object.entries(rollout.orgs);
	const pins = rolloutToCustomerPins({ rollout });

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<RolloutPercentForm
					key={rollout.percent}
					current={rollout.percent}
					onApply={({ percent }) => void onSave({ ...rollout, percent })}
					isSaving={isSaving}
				/>
				<RolloutFlipStatus rollout={rollout} settleMs={SHADOW_ATOM_SETTLE_MS} />
			</div>

			<div className="flex flex-col gap-2">
				<Subheading>Org overrides</Subheading>
				<div className={LIST_FRAME}>
					{orgOverrides.length === 0 && (
						<p className={LIST_EMPTY}>Every org follows the env's percent.</p>
					)}
					{orgOverrides.map(([orgId, percent]) => (
						<ShadowAtomListRow
							key={orgId}
							title={orgId}
							detail={`${percent}%`}
							removeLabel={`Remove override for ${orgId}`}
							onRemove={() => void onSave(removeOrgPercent({ rollout, orgId }))}
							isRemoving={isSaving}
						/>
					))}
				</div>
				<ShadowAtomOrgPercentForm
					onAdd={({ orgId, percent }) =>
						onSave(setOrgPercent({ rollout, orgId, percent }))
					}
					isSaving={isSaving}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Subheading>Pinned customers</Subheading>
				<div className={LIST_FRAME}>
					{pins.length === 0 && (
						<p className={LIST_EMPTY}>No customer is pinned.</p>
					)}
					{pins.map(({ orgId, customerId, included }) => (
						<ShadowAtomListRow
							key={`${orgId}/${customerId}`}
							title={`${orgId} / ${customerId}`}
							detail={included ? "Pinned in" : "Pinned out"}
							removeLabel={`Unpin ${customerId}`}
							onRemove={() =>
								void onSave(unpinCustomer({ rollout, orgId, customerId }))
							}
							isRemoving={isSaving}
						/>
					))}
				</div>
				<ShadowAtomCustomerPinForm
					onPin={(pin) => onSave(pinCustomer({ rollout, ...pin }))}
					isSaving={isSaving}
				/>
			</div>
		</div>
	);
};
