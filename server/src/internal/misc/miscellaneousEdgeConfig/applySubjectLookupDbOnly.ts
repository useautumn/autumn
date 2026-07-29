import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isSubjectLookupDbOnlyEnabled } from "./miscellaneousEdgeConfigStore.js";

export const applySubjectLookupDbOnly = ({ ctx }: { ctx: AutumnContext }) => {
	if (isSubjectLookupDbOnlyEnabled()) ctx.skipCache = true;
};
