/**
 * Contract: the coverage pipe accepts an optional customer/entity scope so scoped
 * property groups reconcile against property presence inside that scope, and it
 * rejects nothing an org-wide caller already sends.
 */
import { expect, test } from "bun:test";
import { propertyRollupCoveragePipeParamsSchema } from "@/external/tinybird/pipes/propertyRollupCoveragePipe.js";

const orgWide = {
	org_id: "org_scoped",
	env: "live",
	event_names: ["scrape"],
	start_date: "2026-06-24 00:00:00",
	end_date: "2026-09-22 00:00:00",
	property_key: "apiKeyId",
};

test("property coverage pipe: org-wide params still parse without a scope", () => {
	const parsed = propertyRollupCoveragePipeParamsSchema.parse(orgWide);
	expect(parsed.customer_id).toBeUndefined();
	expect(parsed.entity_id).toBeUndefined();
});

test("property coverage pipe: customer and entity scope pass through", () => {
	const parsed = propertyRollupCoveragePipeParamsSchema.parse({
		...orgWide,
		customer_id: "cus_123",
		entity_id: "ent_456",
	});
	expect(parsed.customer_id).toBe("cus_123");
	expect(parsed.entity_id).toBe("ent_456");
});
