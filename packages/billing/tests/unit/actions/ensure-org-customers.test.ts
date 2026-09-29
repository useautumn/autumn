import { describe, expect, test } from "bun:test";
import { ensureOrgCustomers } from "../../../src/actions/pushHourlyMeters/ensureOrgCustomers";

describe("ensureOrgCustomers", () => {
	test("creates each org once, named by its slug, keeping order", async () => {
		const created: { id: string; name: string }[] = [];
		const autumn = {
			batchTrack: async () => ({ accepted: 0 }),
			getOrCreateCustomer: async (org: { id: string; name: string }) => {
				created.push(org);
			},
		};
		await ensureOrgCustomers({
			ctx: { autumn },
			orgs: [
				{ id: "org_a", name: "acme" },
				{ id: "org_b", name: "bolt" },
				{ id: "org_a", name: "acme" },
			],
		});
		expect(created).toEqual([
			{ id: "org_a", name: "acme" },
			{ id: "org_b", name: "bolt" },
		]);
	});
});
