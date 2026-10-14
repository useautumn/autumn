import type { SharedContext } from "../../../../../types/sharedContext";

export type ApiPlanContext = Pick<SharedContext, "features" | "expand" | "env">;
