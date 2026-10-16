import { AppEnv } from "@autumn/shared";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useApprovalsCatalog } from "@/views/settings/sections/approvals/useApprovalsCatalog";
import type { DenialNames } from "./nameViolationIds";

const byId = (items: { id: string; name?: string | null }[]) =>
	Object.fromEntries(items.map(({ id, name }) => [id, name || id]));

/** Rules are live, so violation ids resolve against the live catalog whatever env the dashboard is in. */
export const useDenialNames = (): DenialNames => {
	const { products, features } = useApprovalsCatalog();
	const { rewards } = useRewardsQuery({ env: AppEnv.Live });
	return {
		plan: byId(products ?? []),
		feature: byId(features ?? []),
		reward: byId(rewards ?? []),
	};
};
