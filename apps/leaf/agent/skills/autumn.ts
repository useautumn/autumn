import { namedSkills } from "../lib/subagentSkills.js";

// The orchestrator routes and answers from preloaded context; it keeps only
// the shared concepts skill for conceptual pricing-model questions.
export default namedSkills({ names: ["autumn-concepts"] });
