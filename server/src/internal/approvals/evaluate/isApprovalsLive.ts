import { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Rules apply in live only; sandbox is unrestricted. Tests can treat sandbox as live (non-prod). */
export const isApprovalsLive = ({ ctx }: { ctx: AutumnContext }) =>
	ctx.env === AppEnv.Live || Boolean(ctx.testOptions?.approvalsSandboxAsLive);
