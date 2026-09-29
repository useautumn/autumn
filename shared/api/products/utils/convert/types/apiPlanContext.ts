import type { SharedContext } from "../../../../../types/sharedContext";

/** What rendering a plan reads off the context: the org's features, the expand in force, and the env. */
export type ApiPlanContext = Pick<SharedContext, "features" | "expand" | "env">;
