/**
 * Every `x-internal` field the server both returns on GET and accepts on
 * update is either exposed to the fixture or named as server-owned, with a
 * reason. A new one that is neither would silently make `pull` lossy: the
 * value drops from the fixture, and the next `push` reads as a change.
 */

import { expect, test } from "bun:test";
import type { JsonSchema } from "../src/casing/schemaKeyCasing";
import { OVERLAY, type Overlay } from "../src/overlay/overlay";
import {
	internalRoundTripFields,
	roundTripFieldVerdict,
} from "../src/spec/internalRoundTripFields";
import {
	catalogUpdateSchema,
	loadSpec,
	responseSchema,
} from "../src/spec/loadSpec";

const spec = loadSpec();
const root = spec as unknown as JsonSchema;
const update = catalogUpdateSchema({ spec });
const get = responseSchema({ spec, path: "/v1/catalogV2.get" });

const itemSchemas = (collection: string) => ({
	requestItem: (update.properties?.[collection] as JsonSchema)
		.items as JsonSchema,
	responseItem: (get.properties?.[collection] as JsonSchema)
		.items as JsonSchema,
});

test("the real spec: every internal round-trip field is accounted for", () => {
	const unaccounted: string[] = [];
	for (const collection of ["features", "plans"]) {
		const fields = internalRoundTripFields({
			...itemSchemas(collection),
			root,
		});
		for (const field of fields) {
			if (roundTripFieldVerdict({ overlay: OVERLAY, field }) === "unaccounted")
				unaccounted.push(`${collection}.${field.path} (${field.wireKey})`);
		}
	}
	expect(unaccounted).toEqual([]);
});

test("the real spec: allocated_billing is one of them, and is exposed", () => {
	const fields = internalRoundTripFields({ ...itemSchemas("plans"), root });
	const allocatedBilling = fields.find(
		(field) => field.path === "items.price.allocatedBilling",
	);
	if (!allocatedBilling) throw new Error("allocated_billing missing from spec");
	expect(
		roundTripFieldVerdict({ overlay: OVERLAY, field: allocatedBilling }),
	).toBe("exposed");
});

test("a server-owned entry that no field uses is stale", () => {
	const present = new Set<string>();
	for (const collection of ["features", "plans"]) {
		for (const field of internalRoundTripFields({
			...itemSchemas(collection),
			root,
		}))
			present.add(field.wireKey);
	}
	const stale = Object.keys(OVERLAY.serverOwnedInternal).filter(
		(wireKey) => !present.has(wireKey),
	);
	expect(stale).toEqual([]);
});

const synthetic = ({
	internalOnResponse,
	internalOnRequest,
}: {
	internalOnResponse: boolean;
	internalOnRequest: boolean;
}) => {
	const item = (internal: boolean): JsonSchema => ({
		type: "object",
		properties: {
			id: { type: "string" },
			knob: { type: "string", ...(internal ? { "x-internal": true } : {}) },
		},
	});
	return {
		responseItem: item(internalOnResponse),
		requestItem: item(internalOnRequest),
		root: {} as JsonSchema,
	};
};

test("a field internal on only one side is not a round-trip field", () => {
	expect(
		internalRoundTripFields(
			synthetic({ internalOnResponse: true, internalOnRequest: false }),
		),
	).toEqual([]);
});

test("a field internal on both sides is unaccounted until the overlay names it", () => {
	const [field] = internalRoundTripFields(
		synthetic({ internalOnResponse: true, internalOnRequest: true }),
	);
	expect(field).toEqual({ path: "knob", wireKey: "knob" });
	if (!field) throw new Error("unreachable");
	const bare: Overlay = {
		collections: {},
		exposeInternal: [],
		serverOwnedInternal: {},
	};
	expect(roundTripFieldVerdict({ overlay: bare, field })).toBe("unaccounted");
	expect(
		roundTripFieldVerdict({
			overlay: { ...bare, exposeInternal: ["knob"] },
			field,
		}),
	).toBe("exposed");
	expect(
		roundTripFieldVerdict({
			overlay: { ...bare, serverOwnedInternal: { knob: "re-derived" } },
			field,
		}),
	).toBe("server-owned");
});
