import { Button, PageHeader, Skeleton } from "@autumn/ui";
import { Gauge } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { ConfigHealthChip } from "../components/ConfigHealthChip";
import { RateLimitOrgCombobox } from "./RateLimitOrgCombobox";
import { RateLimitOrgOverridesTable } from "./RateLimitOrgOverridesTable";
import {
	type RateLimitOverrideDraft,
	RateLimitOverrideSheet,
} from "./RateLimitOverrideSheet";
import { RateLimitPolicyTable } from "./RateLimitPolicyTable";
import { RateLimitRawJsonDialog } from "./RateLimitRawJsonDialog";
import { listOverrideOrgs } from "./rateLimitOrgs";
import { withOverride, withoutOverrides } from "./rateLimitOverrideEdits";
import { TOUCH_TARGET } from "./rateLimitTableStyles";
import type {
	RateLimitOrg,
	RateLimitOverrideLimits,
	RateLimitPolicySummary,
	RateLimitScope,
} from "./rateLimitTypes";
import { useRateLimitOverrides } from "./useRateLimitOverrides";

const SAVED_SUFFIX = "live in ~10 s";

/** Edit opens on the scope the org already overrides; otherwise per org when the row has one. */
const pickInitialScope = ({
	policy,
	orgKey,
}: {
	policy: RateLimitPolicySummary;
	orgKey?: string;
}): RateLimitScope => {
	const override = policy.overrides.find((entry) => entry.orgKey === orgKey);
	if (override?.perOrg !== undefined) return "perOrg";
	if (override?.perCustomer !== undefined) return "perCustomer";
	return policy.perOrg ? "perOrg" : "perCustomer";
};

const listLayerNames = ({ policy }: { policy: RateLimitPolicySummary }) =>
	[policy.perOrg?.name, policy.perCustomer?.name].filter(
		(name): name is string => name !== undefined,
	);

/** Every rate limit from the server's policy table, with per-org overrides read and written in place. */
export const RateLimitsSection = () => {
	const { view, isLoading, isError, retry, saveOrgs, isSaving } =
		useRateLimitOverrides();
	const [filterOrg, setFilterOrg] = useState<RateLimitOrg | null>(null);
	const [draft, setDraft] = useState<RateLimitOverrideDraft | null>(null);
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [isRawJsonOpen, setIsRawJsonOpen] = useState(false);

	if (isLoading) return <Skeleton className="h-96" />;
	if (isError || !view) {
		return (
			<div className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
				<span className="text-tertiary-foreground">
					Rate limits failed to load.
				</span>
				<Button variant="secondary" size="sm" onClick={() => retry()}>
					Retry
				</Button>
			</div>
		);
	}

	const overrideOrgs = listOverrideOrgs({ view });

	const openSheet = ({ policy }: { policy: RateLimitPolicySummary }) => {
		setDraft({
			org: filterOrg,
			policy,
			scope: pickInitialScope({ policy, orgKey: filterOrg?.key }),
		});
		setIsSheetOpen(true);
	};

	const save = async ({
		orgs,
		message,
	}: {
		orgs: RateLimitOverrideLimits;
		message: string;
	}) => {
		if (isSaving) return false;
		try {
			await saveOrgs({ orgs });
			toast.success(`${message} · ${SAVED_SUFFIX}`);
			return true;
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save rate limit overrides"));
			return false;
		}
	};

	const saveOverride = async ({
		draft,
		value,
	}: {
		draft: RateLimitOverrideDraft;
		value: number;
	}) => {
		const layer = draft.policy[draft.scope];
		if (!layer || !draft.org) return;
		const orgs = withOverride({
			orgs: view.orgs,
			orgKey: draft.org.key,
			layerName: layer.name,
			value,
		});
		if (await save({ orgs, message: "Override saved" })) setIsSheetOpen(false);
	};

	const removeOverride = ({
		org,
		policy,
	}: {
		org: RateLimitOrg;
		policy: RateLimitPolicySummary;
	}) =>
		save({
			orgs: withoutOverrides({
				orgs: view.orgs,
				orgKey: org.key,
				layerNames: listLayerNames({ policy }),
			}),
			message: "Override removed",
		});

	const saveRawJson = async (orgs: RateLimitOverrideLimits) => {
		if (await save({ orgs, message: "Overrides saved" })) {
			setIsRawJsonOpen(false);
		}
	};

	return (
		<section className="flex flex-col gap-1">
			<div className="flex flex-col md:flex-row md:items-center md:justify-between md:gap-4">
				<PageHeader
					icon={<Gauge className="size-4 text-subtle" />}
					title="Rate limits"
					titleAccessory={<ConfigHealthChip healthy={view.configHealthy} />}
				/>
				<div className="flex flex-wrap items-center gap-2 pb-4 md:h-10 md:flex-nowrap">
					<RateLimitOrgCombobox
						value={filterOrg}
						overrideOrgs={overrideOrgs}
						onChange={setFilterOrg}
						placeholder="All orgs"
						triggerClassName="h-11 w-full md:h-auto md:w-56"
					/>
					{filterOrg && (
						<Button
							variant="skeleton"
							size="sm"
							className={TOUCH_TARGET}
							onClick={() => setFilterOrg(null)}
						>
							Clear
						</Button>
					)}
					<Button
						variant="secondary"
						size="sm"
						className={TOUCH_TARGET}
						onClick={() => setIsRawJsonOpen(true)}
					>
						Raw JSON
					</Button>
					<Button
						variant="primary"
						size="sm"
						className={TOUCH_TARGET}
						onClick={() => openSheet({ policy: view.policies[0] })}
					>
						Add override
					</Button>
				</div>
			</div>

			{filterOrg ? (
				<RateLimitOrgOverridesTable
					org={filterOrg}
					policies={view.policies}
					onEdit={(policy) => openSheet({ policy })}
					onRemove={(policy) => removeOverride({ org: filterOrg, policy })}
					isSaving={isSaving}
					onShowAll={() => setFilterOrg(null)}
				/>
			) : (
				<RateLimitPolicyTable
					view={view}
					onOverride={(policy) => openSheet({ policy })}
				/>
			)}

			{draft && (
				<RateLimitOverrideSheet
					open={isSheetOpen}
					onOpenChange={setIsSheetOpen}
					initialDraft={draft}
					policies={view.policies}
					overrideOrgs={overrideOrgs}
					isSaving={isSaving}
					onSave={saveOverride}
				/>
			)}

			<RateLimitRawJsonDialog
				open={isRawJsonOpen}
				onOpenChange={setIsRawJsonOpen}
				orgs={view.orgs}
				isSaving={isSaving}
				onSave={saveRawJson}
			/>
		</section>
	);
};
