import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const preserveSubjectCache = ({ ctx }: { ctx: AutumnContext }): void => {
	ctx.skipSubjectCacheDeletion = true;
};
