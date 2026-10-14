import { atmn } from "atmn";
import { features } from "./features";
import { plans } from "./plans";
import { referralPrograms, rewards } from "./rewards";

export default atmn({
	features,
	plans,
	rewards,
	referralPrograms,
	settings: {},
});
