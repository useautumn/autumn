import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	type Feature,
} from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const createMockOrg = () => ({
	id: "org_test",
	name: "Test Organization",
	slug: "test-org",
	default_currency: "usd",
	stripe_account_id: "acct_test",
});

export const createMockCtx = ({
	features = [],
	org,
}: {
	features?: Feature[];
	org?: ReturnType<typeof createMockOrg>;
}): AutumnContext =>
	({
		features,
		org: org ?? createMockOrg(),
		apiVersion: new ApiVersionClass(ApiVersion.V1_2),
		env: AppEnv.Sandbox,
		logger: logger,
	}) as unknown as AutumnContext;
