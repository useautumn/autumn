/**
 * The `atom` dataset: every Atom's stdout, exported by alien's project log export. Each log line arrives as a
 * string `body` read with `parse_json`, so no Atom field can grow the schema and nothing needs mapping yet.
 *
 *   bun axiom:staging create-atom  # staging
 *   bun axiom:prod create-atom     # prod
 */
import { ensureAxiomDataset } from "./ensureAxiomDataset.js";

export const createAtomDataset = () =>
	ensureAxiomDataset({
		name: "atom",
		description: "Every Atom's stdout, exported by alien",
		mapFields: [],
	});
