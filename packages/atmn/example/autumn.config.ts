import { feature } from "../src/generated/features";
import { atmn } from "../src/generated/wire";

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
