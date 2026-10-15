import { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** The env approval rules are evaluated in; tests can ask for live, since sandbox is exempt. */
export const resolveApprovalsEnv = ({ ctx }: { ctx: AutumnContext }): AppEnv =>
	ctx.testOptions?.approvalsSandboxAsLive ? AppEnv.Live : ctx.env;
