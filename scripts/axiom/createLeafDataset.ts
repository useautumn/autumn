import { ensureAxiomDataset } from "./ensureAxiomDataset.js";

export const createLeafDataset = () =>
	ensureAxiomDataset({
		name: "leaf",
		description: "Leaf runtime logs and MCP usage analytics",
		mapFields: ["context", "data", "extras", "input", "output", "req", "res"],
	});
