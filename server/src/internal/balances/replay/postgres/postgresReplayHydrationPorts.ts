import type {
	AppEnv,
	Feature,
	FullSubject,
	Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type ReplayOrganizationLoader = (params: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}) => Promise<{ org: Organization; features: Feature[] } | null>;

export type ReplaySubjectLoader = (params: {
	ctx: AutumnContext;
	customerId: string;
	readFrom: "primary";
	runLazyResets: false;
	asOfTimestampMs: number;
}) => Promise<{ fullSubject: FullSubject } | undefined>;

export const loadReplayOrganization: ReplayOrganizationLoader = async ({
	db,
	orgId,
	env,
}) => {
	const { OrgService } = await import("@/internal/orgs/OrgService.js");
	return OrgService.getWithFeatures({ db, orgId, env, allowNotFound: true });
};

export const loadReplayFullSubject: ReplaySubjectLoader = async (params) => {
	const { getFullSubjectNormalized } = await import(
		"@/internal/customers/repos/getFullSubject/getFullSubject.js"
	);
	return getFullSubjectNormalized(params);
};
