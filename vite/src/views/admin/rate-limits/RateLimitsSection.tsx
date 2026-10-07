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
import type {
	RateLimitOrg,
	RateLimitOverrideLimits,
	RateLimitPolicySummary,
} from "./rateLimitTypes";
import { useRateLimitOverrides } from "./useRateLimitOverrides";

const SAVED_SUFFIX = "live in ~10 s";

const listLayerNames = ({ policy }: { policy: RateLimitPolicySummary }) =>
	[policy.perOrg?.name, policy.perCustomer?.name].filter(
		(name): name is string => name !== undefined,
	);

/** Every rate limit from the server's policy table, with per-org overrides read and written in place. */
export const RateLimitsSection = () => {
	const { view, isLoading, saveOrgs, isSaving } = useRateLimitOverrides();
	const [filterOrg, setFilterOrg] = useState<RateLimitOrg | null>(null);
	const [draft, setDraft] = useState<RateLimitOverrideDraft | null>(null);
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [isRawJsonOpen, setIsRawJsonOpen] = useState(false);

	if (isLoading || !view) return <Skeleton className="h-96" />;

	const overrideOrgs = listOverrideOrgs({ view });

	const openSheet = ({ policy }: { policy: RateLimitPolicySummary }) => {
		setDraft({
			org: filterOrg,
			policy,
			scope: policy.perOrg ? "perOrg" : "perCustomer",
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
			<PageHeader
				icon={<Gauge className="size-4 text-subtle" />}
				title="Rate limits"
				titleAccessory={<ConfigHealthChip healthy={view.configHealthy} />}
			>
				<RateLimitOrgCombobox
					value={filterOrg}
					overrideOrgs={overrideOrgs}
					onChange={setFilterOrg}
					placeholder="All orgs"
					triggerClassName="w-56"
				/>
				{filterOrg && (
					<Button
						variant="skeleton"
						size="sm"
						onClick={() => setFilterOrg(null)}
					>
						Clear
					</Button>
				)}
				<Button
					variant="secondary"
					size="sm"
					onClick={() => setIsRawJsonOpen(true)}
				>
					Raw JSON
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={() => openSheet({ policy: view.policies[0] })}
				>
					Add override
				</Button>
			</PageHeader>

			{filterOrg ? (
				<RateLimitOrgOverridesTable
					org={filterOrg}
					policies={view.policies}
					onEdit={(policy) => openSheet({ policy })}
					onRemove={(policy) => removeOverride({ org: filterOrg, policy })}
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
