/**
 * The `atom` dataset: every Atom's stdout, exported by alien. Alien's log normalizer lands each pino line's fields
 * as one dynamic `attributes.app` column, so no Atom field can grow the schema and nothing needs mapping. Virtual
 * fields lift them back to the names `express` uses, so `atom` is queried the same way.
 *
 *   bun axiom:staging create-atom  # staging
 *   bun axiom:prod create-atom     # prod
 */
import {
	type AxiomVirtualField,
	ensureAxiomDataset,
} from "./ensureAxiomDataset.js";

/** One of the Atom's own log fields, read from where alien lands it. */
const appField = ({
	name,
	as = (path: string) => path,
	description,
}: {
	name: string;
	as?: (path: string) => string;
	description: string;
}): AxiomVirtualField => ({
	name,
	expression: as(`['attributes.app'].${name}`),
	description,
});

const asString = (path: string) => `tostring(${path})`;
const asNumber = (path: string) => `toreal(${path})`;

export const createAtomDataset = () =>
	ensureAxiomDataset({
		name: "atom",
		description: "Every Atom's stdout, exported by alien",
		mapFields: [],
		virtualFields: [
			appField({ name: "level", as: asString, description: "Log level" }),
			appField({ name: "msg", as: asString, description: "Log message" }),
			appField({
				name: "type",
				as: asString,
				description: "Event type, e.g. atom_health",
			}),
			appField({
				name: "statusCode",
				as: asNumber,
				description: "HTTP status the Atom answered with",
			}),
			appField({
				name: "durationMs",
				as: asNumber,
				description: "Request duration in ms",
			}),
			appField({
				name: "forwarded",
				as: asString,
				description: "Why the Atom forwarded the request to the API",
			}),
			appField({
				name: "errorCode",
				as: asString,
				description: "The Atom's error code for a failed request",
			}),
			appField({
				name: "req",
				description: "Request: method, path, customer_id, entity_id, …",
			}),
			appField({ name: "res", description: "Response the Atom logged" }),
			appField({ name: "data", description: "Event payload, e.g. health" }),
			appField({ name: "error", description: "Error details" }),
		],
	});
