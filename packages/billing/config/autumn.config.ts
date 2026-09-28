import { atmn } from "atmn";
import { features } from "./features";
import { plans } from "./plans";
import { referralPrograms, rewards } from "./rewards";

/**
 * Your catalog, as code. `atmn pull` fills the collection files from the
 * server; `atmn push` makes the server match them.
 */
export default atmn({
	features,
	plans,
	rewards,
	referralPrograms,
	settings: {},
});
