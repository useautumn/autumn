import { disableTool } from "eve/tools";
import { loadSkill } from "eve/tools/load_skill";

export default process.env.LEAF_LAB_EXECUTION === "single"
	? disableTool()
	: loadSkill;
