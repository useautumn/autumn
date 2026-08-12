import { afterAll, describe, expect, mock, test } from "bun:test";
import { CustomerExpand } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const mockGetByRedeemer = mock(async () => [
	{
		id: "rr_123",
		referral_code_id: "rc_123",
		internal_customer_id: "cus_redeemer_int_id",
		internal_reward_program_id: "prog_int_123",
		applied: true, // referrer applied
		redeemer_applied: true, // redeemer applied
		created_at: 1718000000,
		referrer: {
			id: "cus_referrer_1",
			name: "Alice Referrer",
			email: "alice@example.com",
		},
		reward_program: {
			id: "prog_public_id",
		},
	},
]);

await mockModuleWithRestore("@/internal/rewards/repos/index.js", () => ({
	redemptionRepo: {
		getByRedeemer: mockGetByRedeemer,
		getByReferrer: mock(async () => []),
	},
}));

const { getCusReferredBy } = await import(
	"@/internal/customers/cusUtils/cusResponseUtils/getCusReferredBy.js"
);

describe("getCusReferredBy", () => {
	test("returns undefined when expand is empty or does not include referrals/referred_by", async () => {
		const res = await getCusReferredBy({
			db: {} as never,
			fullCus: { internal_id: "cus_redeemer_int_id" } as never,
			expand: [CustomerExpand.Invoices],
		});

		expect(res).toBeUndefined();
	});

	test("returns referred_by records when expand includes CustomerExpand.Referrals", async () => {
		const res = await getCusReferredBy({
			db: {} as never,
			fullCus: { internal_id: "cus_redeemer_int_id" } as never,
			expand: [CustomerExpand.Referrals],
		});

		expect(res).toBeDefined();
		expect(res).toHaveLength(1);
		expect(res![0]).toEqual({
			program_id: "prog_public_id",
			referrer: {
				id: "cus_referrer_1",
				name: "Alice Referrer",
				email: "alice@example.com",
			},
			reward_applied: true,
			created_at: 1718000000,
		});
	});

	test("returns referred_by records when expand includes CustomerExpand.ReferredBy", async () => {
		const res = await getCusReferredBy({
			db: {} as never,
			fullCus: { internal_id: "cus_redeemer_int_id" } as never,
			expand: [CustomerExpand.ReferredBy],
		});

		expect(res).toBeDefined();
		expect(res).toHaveLength(1);
		expect(res![0]).toEqual({
			program_id: "prog_public_id",
			referrer: {
				id: "cus_referrer_1",
				name: "Alice Referrer",
				email: "alice@example.com",
			},
			reward_applied: true,
			created_at: 1718000000,
		});
	});
});

afterAll(() => {
	mock.restore();
});
