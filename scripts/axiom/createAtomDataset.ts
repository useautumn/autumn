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

/** One of the Atom's own log fields, read from where alien lands it; `path` when the alias names it differently. */
const appField = ({
	name,
	path = name,
	as = (field: string) => field,
	description,
}: {
	name: string;
	path?: string;
	as?: (field: string) => string;
	description: string;
}): AxiomVirtualField => ({
	name,
	expression: as(`['attributes.app'].${path}`),
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
			// The express dataset's aliases, over the server-shaped `context.*` and `req.id` the Atom logs.
			appField({
				name: "reqId",
				path: "req.id",
				as: asString,
				description: "Request id (mirrors express reqId)",
			}),
			appField({
				name: "orgId",
				path: "context.org_id",
				as: asString,
				description: "Org id (mirrors express orgId)",
			}),
			appField({
				name: "orgSlug",
				path: "context.org_slug",
				as: asString,
				description: "Org slug (mirrors express orgSlug)",
			}),
			appField({
				name: "cusId",
				path: "context.customer_id",
				as: asString,
				description: "Customer id (mirrors express cusId)",
			}),
			appField({
				name: "entityId",
				path: "context.entity_id",
				as: asString,
				description: "Entity id",
			}),
			appField({
				name: "env",
				path: "context.env",
				as: asString,
				description: "App env (sandbox/live), from the request's key",
			}),
			appField({
				name: "apiVersion",
				path: "context.api_version",
				as: asString,
				description: "API version the request named",
			}),
		],
	});
