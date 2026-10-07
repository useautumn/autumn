import type { AutumnContext } from "@/honoUtils/HonoEnv";

export type RateLimitRequestCtx = Pick<
	AutumnContext,
	"apiVersion" | "requestBody"
>;
