import { expect, test } from "bun:test";
import {
	emptyVersioningFlags,
	shouldProtectReferencedCatalogRows,
} from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

test("catalog row protection: versionable refs still protect", () => {
	expect(
		shouldProtectReferencedCatalogRows({
			usage: { ...emptyVersioningFlags(), hasVersionableRowRefs: true },
		}),
	).toBe(true);
});

test("catalog row protection: expired-only customer products still protect", () => {
	expect(
		shouldProtectReferencedCatalogRows({
			usage: { ...emptyVersioningFlags(), hasAnyCustomerProducts: true },
		}),
	).toBe(true);
});

test("catalog row protection: unused catalog rows stay deletable", () => {
	expect(
		shouldProtectReferencedCatalogRows({
			usage: emptyVersioningFlags(),
		}),
	).toBe(false);
});
