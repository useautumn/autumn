/**
 * collectProductStateRows — flatten listFull payload into the product-state list.
 *
 * Contract:
 *   top-level rows stay
 *   parent_plan_licenses[].product and variants[] are copied in
 *   same internal_id keeps the top-level row
 *   every variant version is kept
 */

import { describe, expect, test } from "bun:test";
import type { FullProduct, ParentPlanLicense } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { collectProductStateRows } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/collectProductStateRows";

const full = ({
	id,
	version = 1,
	internalId,
}: {
	id: string;
	version?: number;
	internalId?: string;
}): FullProduct =>
	({
		...products.createFull({ id }),
		version,
		internal_id: internalId ?? `internal_${id}_v${version}`,
	}) as FullProduct;

const parentLink = ({ product }: { product: FullProduct }): ParentPlanLicense =>
	({
		product,
	}) as ParentPlanLicense;

describe("collectProductStateRows", () => {
	test("copies nested license parents and every variant version", () => {
		const team = full({ id: "team" });
		const teamEuV1 = full({ id: "team-eu", version: 1 });
		const teamEuV2 = full({ id: "team-eu", version: 2 });
		const seat = {
			...full({ id: "seat" }),
			parent_plan_licenses: [parentLink({ product: team })],
		};
		const teamWithVariants = {
			...team,
			variants: [teamEuV1, teamEuV2],
		};

		const rows = collectProductStateRows({
			products: [seat, teamWithVariants],
			payloadPlanIds: ["seat", "team"],
		});
		const keys = rows
			.map((product) => `${product.id}:${product.version}`)
			.sort();

		expect(keys).toEqual(["seat:1", "team-eu:1", "team-eu:2", "team:1"]);
	});

	test("does not copy variants off a license parent when the parent is not in the payload", () => {
		const teamEu = full({ id: "team-eu" });
		const team = {
			...full({ id: "team" }),
			variants: [teamEu],
		};
		const seat = {
			...full({ id: "seat" }),
			parent_plan_licenses: [parentLink({ product: team })],
		};

		const rows = collectProductStateRows({
			products: [seat, team],
			payloadPlanIds: ["seat"],
		});
		expect(rows.some((product) => product.id === "team")).toBe(true);
		expect(rows.some((product) => product.id === "team-eu")).toBe(false);
	});

	test("top-level row wins over a nested parent with the same internal_id", () => {
		const teamStub = full({ id: "team" });
		const teamFull = {
			...teamStub,
			name: "Team full",
			variants: [full({ id: "team-eu" })],
		};
		const seat = {
			...full({ id: "seat" }),
			parent_plan_licenses: [
				parentLink({ product: { ...teamStub, name: "Team stub" } }),
			],
		};

		const rows = collectProductStateRows({
			products: [seat, teamFull],
			payloadPlanIds: ["seat", "team"],
		});
		const team = rows.find((product) => product.id === "team");
		expect(team?.name).toBe("Team full");
		expect(rows.some((product) => product.id === "team-eu")).toBe(true);
	});
});
