import { describe, expect, it } from "bun:test";
import { buildPartitionsFromBoundaries } from "@/internal/customers/exports/queries/getCustomerExportPartitions.js";

describe("buildPartitionsFromBoundaries", () => {
	it("returns no partitions when nothing matched", () => {
		expect(buildPartitionsFromBoundaries({ boundaryInternalIds: [] })).toEqual(
			[],
		);
	});

	it("builds a single unbounded-below range when everything fits one worker", () => {
		expect(
			buildPartitionsFromBoundaries({ boundaryInternalIds: ["id_9"] }),
		).toEqual([
			{ partNumber: 1, upperInternalId: "id_9", lowerInternalId: null },
		]);
	});

	it("chains descending ranges and numbers parts from one", () => {
		expect(
			buildPartitionsFromBoundaries({
				boundaryInternalIds: ["id_9", "id_6", "id_3"],
			}),
		).toEqual([
			{ partNumber: 1, upperInternalId: "id_9", lowerInternalId: "id_6" },
			{ partNumber: 2, upperInternalId: "id_6", lowerInternalId: "id_3" },
			{ partNumber: 3, upperInternalId: "id_3", lowerInternalId: null },
		]);
	});

	it("leaves the remainder range open at the bottom", () => {
		const partitions = buildPartitionsFromBoundaries({
			boundaryInternalIds: ["id_9", "id_5"],
		});

		expect(partitions).toHaveLength(2);
		expect(partitions[partitions.length - 1].lowerInternalId).toBeNull();
	});

	it("keeps ranges contiguous so no customer is skipped or duplicated", () => {
		const boundaryInternalIds = ["id_9", "id_6", "id_3"];
		const partitions = buildPartitionsFromBoundaries({ boundaryInternalIds });

		for (const [index, partition] of partitions.entries()) {
			const next = partitions[index + 1];
			expect(partition.lowerInternalId).toBe(next?.upperInternalId ?? null);
		}
	});
});
