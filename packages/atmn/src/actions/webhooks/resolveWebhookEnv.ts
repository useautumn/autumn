import type { Target } from "../../env/resolveTarget";
import { sandboxSlug } from "../../generated/sandboxName";
import type { FetchOrgInfo, OrgInfo } from "../env/types/orgInfo";
import type { WebhookEnv } from "./types/webhookEnv";

/** `/organization/me`, asked at most once per command. */
const memoized = (fetchOrgInfo: FetchOrgInfo): FetchOrgInfo => {
	let pending: Promise<OrgInfo> | undefined;
	return () => {
		pending ??= fetchOrgInfo();
		return pending;
	};
};

/**
 * `-p` is `live` and the default sandbox is `sandbox`, with no lookup. A named
 * sandbox is keyed by its slug, which only its name gives: one lookup.
 */
export const resolveWebhookEnv = async ({
	target,
	prod,
	fetchOrgInfo,
}: {
	target: Target;
	prod: boolean;
	fetchOrgInfo: FetchOrgInfo;
}): Promise<WebhookEnv> => {
	const orgInfo = memoized(fetchOrgInfo);
	const orgId = async () => (await orgInfo()).id;
	if (prod) return { key: "live", live: true, orgId };
	if (target.sandboxId === undefined)
		return { key: "sandbox", live: false, orgId };
	return { key: sandboxSlug((await orgInfo()).name), live: false, orgId };
};
