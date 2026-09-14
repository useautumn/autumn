import { agentSkills } from "../lib/agentSkills.js";

// `autumn-billing` is inlined in the prompt — needed on almost every turn, so a
// load_skill round trip for it is pure latency. The rest stay on demand.
export default agentSkills({ agent: "leaf", inlined: ["autumn-billing"] });
