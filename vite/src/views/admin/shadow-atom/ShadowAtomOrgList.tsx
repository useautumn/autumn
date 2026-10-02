import { format } from "date-fns";
import { LIST_EMPTY, LIST_FRAME } from "../edge-config/rolloutRowStyles";
import { ShadowAtomListRow } from "./ShadowAtomListRow";
import { ShadowAtomOrgRegisterForm } from "./ShadowAtomOrgRegisterForm";
import { ShadowAtomSecret } from "./ShadowAtomSecret";
import type { ShadowAtomEnvView } from "./shadowAtomTypes";

/** Orgs with a folder and a token on the env's shadow Atom; only these are pushed to and shadowed. */
export const ShadowAtomOrgList = ({
	envConfig,
	issued,
	onRegister,
	onUnregister,
	isRegistering,
	isBusy,
}: {
	envConfig: ShadowAtomEnvView;
	issued: { orgId: string; token: string } | null;
	onRegister: ({ orgId }: { orgId: string }) => Promise<boolean>;
	onUnregister: ({ orgId }: { orgId: string }) => void;
	isRegistering: boolean;
	/** A register or unregister in flight: both wait, so a slow one never undoes a newer one. */
	isBusy: boolean;
}) => {
	const orgs = Object.entries(envConfig.orgs);
	const canRegister = Boolean(envConfig.endpointUrl && envConfig.hasAdminToken);

	return (
		<div className="flex flex-col gap-2">
			<div className={LIST_FRAME}>
				{orgs.length === 0 && (
					<p className={LIST_EMPTY}>No org is on the shadow Atom.</p>
				)}
				{orgs.map(([orgId, { registeredAt }]) => (
					<ShadowAtomListRow
						key={orgId}
						title={orgId}
						detail={`Registered ${format(registeredAt, "d MMM HH:mm")}`}
						removeLabel={`Unregister ${orgId}`}
						onRemove={() => onUnregister({ orgId })}
						isRemoving={isBusy || !canRegister}
					/>
				))}
			</div>
			{issued && (
				<ShadowAtomSecret
					label={`Token for ${issued.orgId}`}
					value={issued.token}
					hint="Shown once. Registering the org again rotates it."
				/>
			)}
			{!canRegister && (
				<p className="text-xs text-tertiary-foreground">
					Registering and unregistering need a ready shadow Atom: its endpoint
					and admin token.
				</p>
			)}
			<ShadowAtomOrgRegisterForm
				onRegister={onRegister}
				isSaving={isRegistering}
				disabled={isBusy || !canRegister}
			/>
		</div>
	);
};
