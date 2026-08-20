import { subagentSkills } from "../lib/subagentSkills.js";

// Catalog work stays rooted until the catalog specialist is wired, so the
// orchestrator keeps only the catalog skill and its prerequisites.
export default subagentSkills({ agent: "catalog" });
