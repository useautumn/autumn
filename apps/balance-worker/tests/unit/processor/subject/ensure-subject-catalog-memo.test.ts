import { expect, test } from "bun:test";
import type { CatalogCache } from "@autumn/catalog-lru";
import { ensureSubjectCatalog } from "../../../../src/processor/subject/actions/ensureSubject/ensureSubjectCatalog.js";
import { createSubjectJoinCache } from "../../../../src/processor/subject/subjectJoinCache/createSubjectJoinCache.js";
import type { SubjectScope } from "../../../../src/processor/subject/types/subject.js";
import { createTestCatalogCache } from "../../../fixtures/catalog.js";
import { createState, testIdentity } from "../../../fixtures/mutations.js";

/** The real cache, counting how often the ensure path reads it. */
function createScope() {
	const inner = createTestCatalogCache();
	let reads = 0;
	const catalogCache: CatalogCache = {
		...inner,
		read: (params) => {
			reads += 1;
			return inner.read(params);
		},
	};
	const scope = {
		ctx: { catalogCache },
		state: { joinCache: createSubjectJoinCache({ ctx: { catalogCache } }) },
	} as unknown as SubjectScope;
	return { scope, catalogCache, reads: () => reads };
}

test("a state already joined while the catalog stood still is not ensured again", async () => {
	const { scope, reads } = createScope();
	const state = createState();
	const first = await ensureSubjectCatalog({
		scope,
		identity: testIdentity,
		state,
	});
	const afterFirst = reads();
	expect(afterFirst).toBeGreaterThan(0);
	expect(Object.keys(first.entitlements).length).toBeGreaterThan(0);

	const second = await ensureSubjectCatalog({
		scope,
		identity: testIdentity,
		state,
	});
	expect(second).toBe(first);
	expect(reads()).toBe(afterFirst);
	// The hydrator's own catalog read for this state is the same object: no join is built twice.
	expect(scope.state.joinCache.peekCatalog({ state })).toBe(first);
});

test("a replaced state, or a moved catalog, is ensured afresh", async () => {
	const { scope, catalogCache, reads } = createScope();
	const state = createState();
	const first = await ensureSubjectCatalog({
		scope,
		identity: testIdentity,
		state,
	});
	const afterFirst = reads();

	const replaced = await ensureSubjectCatalog({
		scope,
		identity: testIdentity,
		state: createState(),
	});
	expect(replaced).not.toBe(first);
	expect(reads()).toBeGreaterThan(afterFirst);

	const afterReplaced = reads();
	catalogCache.invalidate({ orgId: testIdentity.orgId, env: testIdentity.env });
	const moved = await ensureSubjectCatalog({
		scope,
		identity: testIdentity,
		state,
	});
	expect(moved).not.toBe(first);
	expect(reads()).toBeGreaterThan(afterReplaced);
});
