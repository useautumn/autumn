import { expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import { resolvePlanLicenseProduct } from "@/views/products/plan/components/plan-licenses/resolvePlanLicenseProduct";

test("resolves the license version pinned by the parent plan", () => {
	const products = [
		{ id: "team_seat", version: 1, name: "$54" },
		{ id: "team_seat", version: 5, name: "$72" },
	] as ProductV2[];

	expect(
		resolvePlanLicenseProduct({ products, planId: "team_seat", version: 1 })
			?.name,
	).toBe("$54");
});
