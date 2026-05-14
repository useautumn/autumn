import { makeExistenceParser } from "./makeExistenceParser.js";

/**
 * Phase 1 supports only existence checks on `rollover`:
 *   rollover: null           → entitlement has no rollover config
 *   rollover: { $ne: null }  → has rollover config
 * Nested-field filtering (e.g. `rollover: { max: { $ne: null } }`) is
 * deferred — the schema's empty inner object leaves room for it.
 */
export const parseRolloverExistence = makeExistenceParser({
	field: "rollover",
	scopePath: "plan.item.rollover",
});
