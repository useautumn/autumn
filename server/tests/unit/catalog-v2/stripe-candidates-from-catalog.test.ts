/**
 * Stripe init candidates come from the projected catalog — including nested
 * base_product / variants — never a second listFull.
 *
 * Contract:
 *   top-level projected rows win over nested snapshots
 *   variant-only payload still sees Team via TeamEU.base_product
 *   family is the base row + its variants; unrelated plans are excluded
 */

import { describe, expect, test } from "bun:test";
import type { FullProduct } from "@autumn/shared";
import {
	catalogProductsByInternalId,
	stripeCandidatesFromCatalog,
} from "@/internal/catalogV2/execute/executeInitStripeResources/stripeCandidatesFromCatalog";

const product = ({
	internalId,
	baseInternalProductId = null,
	processorId,
	baseProduct,
	variants = [],
}: {
	internalId: string;
	baseInternalProductId?: string | null;
	processorId?: string;
	baseProduct?: FullProduct | null;
	variants?: FullProduct[];
}): FullProduct =>
	({
		id: internalId,
		internal_id: internalId,
		base_internal_product_id: baseInternalProductId,
		processor: processorId ? { type: "stripe", id: processorId } : null,
		prices: [],
		entitlements: [],
		licenses: [],
		...(baseProduct !== undefined ? { base_product: baseProduct } : {}),
		variants,
	}) as unknown as FullProduct;

describe("stripeCandidatesFromCatalog", () => {
	test("variant-only payload picks up the nested base_product", () => {
		const team = product({ internalId: "team_v1", processorId: "prod_team" });
		const teamEu = product({
			internalId: "eu_v1",
			baseInternalProductId: "team_v1",
			baseProduct: team,
		});

		const catalogByInternalId = catalogProductsByInternalId({
			products: [teamEu],
		});
		const candidates = stripeCandidatesFromCatalog({
			product: teamEu,
			catalogByInternalId,
		});

		expect(candidates.map((candidate) => candidate.internal_id)).toEqual([
			"team_v1",
		]);
		expect(candidates[0]).toBe(team);
	});

	test("top-level projected row wins over a nested snapshot", () => {
		const nestedTeam = product({
			internalId: "team_v1",
			processorId: "prod_stale",
		});
		const liveTeam = product({
			internalId: "team_v1",
			processorId: "prod_live",
		});
		const teamEu = product({
			internalId: "eu_v1",
			baseInternalProductId: "team_v1",
			baseProduct: nestedTeam,
		});

		const catalogByInternalId = catalogProductsByInternalId({
			products: [liveTeam, teamEu],
		});
		const candidates = stripeCandidatesFromCatalog({
			product: teamEu,
			catalogByInternalId,
		});

		expect(candidates).toHaveLength(1);
		expect(candidates[0]).toBe(liveTeam);
		expect(candidates[0]?.processor?.id).toBe("prod_live");
	});

	test("family is the base + its variants; unrelated plans are excluded", () => {
		const team = product({ internalId: "team_v1", processorId: "prod_team" });
		const teamEu = product({
			internalId: "eu_v1",
			baseInternalProductId: "team_v1",
		});
		const teamUk = product({
			internalId: "uk_v1",
			baseInternalProductId: "team_v1",
		});
		const pro = product({ internalId: "pro_v1", processorId: "prod_pro" });

		const catalogByInternalId = catalogProductsByInternalId({
			products: [team, teamEu, teamUk, pro],
		});
		const candidates = stripeCandidatesFromCatalog({
			product: teamEu,
			catalogByInternalId,
		});

		expect(
			candidates.map((candidate) => candidate.internal_id).sort(),
		).toEqual(["team_v1", "uk_v1"]);
	});
});
