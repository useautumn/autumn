import { disableTool } from "eve/tools";

/** The single definition of leaf's disabled framework-tool surface; every
 * agent dir's tools/<name>.ts re-exports this. */
export const disabledFrameworkTool = disableTool();
