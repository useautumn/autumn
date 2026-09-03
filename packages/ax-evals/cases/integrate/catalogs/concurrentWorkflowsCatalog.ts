/**
 * Concurrency-limit catalog: workflows is a non-consumable LEVEL (slots in
 * use, not a spend counter), so its item has no reset. The auto-enable free
 * plan allows 2 workflows at a time.
 */
export const concurrentWorkflowsCatalog = `import { feature, plan, item } from "atmn";

export const workflows = feature({
	id: "workflows",
	name: "Concurrent Workflows",
	type: "metered",
	consumable: false,
});

export const free = plan({
	id: "free",
	name: "Free",
	autoEnable: true,
	items: [item({ featureId: workflows.id, included: 2 })],
});
`;
