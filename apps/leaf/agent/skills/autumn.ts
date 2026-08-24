import { namedSkills } from "../lib/subagentSkills.js";

// Catalog writes are not exposed on the orchestrator; it keeps only the
// shared concepts skill for answering catalog read questions.
export default namedSkills({ names: ["autumn-concepts"] });
