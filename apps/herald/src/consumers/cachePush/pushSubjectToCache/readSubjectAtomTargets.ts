import type { MeteringIdentity } from "@autumn/balance-engine";
import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";
import { orgToAtomTargets } from "../../../atom/orgToAtomTargets.js";
import { getOrgWithFeaturesCached } from "../../../orgs/getOrgWithFeaturesCached.js";
import type { CachePushContext } from "../types/cachePushContext.js";
import type { SubjectAtomTargets } from "../types/subjectAtomTargets.js";

const appEnvSchema = z.enum(AppEnv);

/** The subject's org and every Atom that holds the subject, or null when no Atom does. */
export const readSubjectAtomTargets = async ({
	ctx,
	identity,
}: {
	ctx: CachePushContext;
	identity: MeteringIdentity;
}): Promise<SubjectAtomTargets | null> => {
	const env = appEnvSchema.parse(identity.env);
	const orgWithFeatures = await getOrgWithFeaturesCached({
		ctx,
		orgId: identity.orgId,
		env,
	});
	if (!orgWithFeatures) return null;
	const { org, atomDeployments } = orgWithFeatures;
	const atomConnections = orgToAtomTargets({
		shadowAtomConfig: ctx.shadowAtomConfig.get(),
		org,
		atomDeployments,
		env,
		customerId: identity.customerId,
	});
	if (atomConnections.length === 0) return null;
	return { org, atomConnections };
};
