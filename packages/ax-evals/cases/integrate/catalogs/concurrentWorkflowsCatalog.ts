export const concurrentWorkflowsCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "workflows",
			name: "Concurrent Workflows",
			type: "metered",
			consumable: false,
		}),
	],
	plans: [
		plan({
			planId: "free",
			versionSlug: "v1",
			active: true,
			name: "Free",
			autoEnable: true,
			items: [{ featureId: "workflows", included: 2 }],
		}),
	],
});
`;
