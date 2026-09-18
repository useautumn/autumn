import { feature } from "../src/generated/features";
import { atmn } from "../src/generated/wire";

/**
 * A config you can push. Every feature you want to exist goes here — the
 * payload is the complete desired catalog, so a feature you delete from this
 * file is a feature you are asking the server to remove.
 */
export default atmn({
	features: [
		feature({
			featureId: "atmn_demo_messages",
			name: "Demo Messages",
			type: "metered",
			consumable: true,
		}),
	],
});
