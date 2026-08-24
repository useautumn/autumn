import { describe, expect, test } from "bun:test";
import type { FullProduct } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { detectVersionSlugCollisions } from "@/internal/catalogV2/actions/updateCatalog/errors/detectVersionSlugCollisions";

const row = ({
	id,
	version,
	versionSlug,
}: {
	id: string;
	version: number;
	versionSlug: string | null;
}): FullProduct =>
	({
		...products.createFull({ id }),
		internal_id: `internal_${id}_v${version}`,
		version,
		version_slug: versionSlug,
	}) as FullProduct;

describe("detectVersionSlugCollisions", () => {
	test("swap is consistent — each slug owned once at end of call", () => {
		expect(
			detectVersionSlugCollisions({
				products: [
					row({ id: "pro", version: 1, versionSlug: "v2" }),
					row({ id: "pro", version: 2, versionSlug: "v1" }),
				],
			}),
		).toEqual([]);
	});

	test("same slug on two versions of one plan is a collision", () => {
		expect(
			detectVersionSlugCollisions({
				products: [
					row({ id: "pro", version: 1, versionSlug: "summer" }),
					row({ id: "pro", version: 2, versionSlug: "summer" }),
				],
			}),
		).toEqual([{ planId: "pro", versionSlug: "summer", versions: [1, 2] }]);
	});

	test("same slug on two plan ids is allowed", () => {
		expect(
			detectVersionSlugCollisions({
				products: [
					row({ id: "pro", version: 1, versionSlug: "summer" }),
					row({ id: "free", version: 1, versionSlug: "summer" }),
				],
			}),
		).toEqual([]);
	});
});
