/**
 * Concurrency-limit catalog: workflows is a non-consumable LEVEL (slots in
 * use, not a spend counter), so its item has no reset. The auto-enable free
 * plan allows 2 workflows at a time.
 */
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
			name: "Free",
			autoEnable: true,
			items: [{ featureId: "workflows", included: 2 }],
		}),
	],
});
`;
