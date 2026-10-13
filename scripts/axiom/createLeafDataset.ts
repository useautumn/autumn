/**
 * The `leaf` dataset: Leaf runtime logs and MCP usage analytics.
 * Tool payloads, req/res bodies and per-log details have open-ended shape, so they are map fields.
 *
 *   bun axiom create-leaf          # dev
 *   bun axiom:prod create-leaf     # prod
 */
import { ensureAxiomDataset } from "./ensureAxiomDataset.js";

export const createLeafDataset = () =>
	ensureAxiomDataset({
		name: "leaf",
		description: "Leaf runtime logs and MCP usage analytics",
		mapFields: ["context", "data", "extras", "input", "output", "req", "res"],
	});
