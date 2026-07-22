import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { FullCustomer, FullSubject, Rollover } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyResetResults } from "@/internal/customers/actions/resetCustomerEntitlements/applyResetResults.js";
import type { ProcessResetResult } from "@/internal/customers/actions/resetCustomerEntitlements/processReset.js";
import { applyResetResultsToFullSubject } from "@/internal/customers/actions/resetCustomerEntitlementsV2/applyResetResultsToFullSubject.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";

const CUSTOMER_ENTITLEMENT_ID = "cus_ent_pool";

type MutableCustomerEntitlement = {
	id: string;
	balance: number;
	additional_balance: number;
	adjustment: number;
	entities: null;
	next_reset_at: number;
	rollovers: Rollover[];
};

const createCustomerEntitlement = (): MutableCustomerEntitlement => ({
	id: CUSTOMER_ENTITLEMENT_ID,
	balance: 120,
	additional_balance: 0,
	adjustment: 300,
	entities: null,
	next_reset_at: 1000,
	rollovers: [],
});

const authoritativeRollover: Rollover = {
	id: "roll_authoritative",
	cus_ent_id: CUSTOMER_ENTITLEMENT_ID,
	balance: 180,
	usage: 0,
	expires_at: 3000,
	entities: {},
};

const resetResult = ({
	rolloverInsert,
}: {
	rolloverInsert?: ProcessResetResult["rolloverInsert"];
} = {}): ProcessResetResult => ({
	updates: {
		balance: 300,
		additional_balance: 0,
		adjustment: 300,
		entities: null,
		next_reset_at: 2000,
	},
	...(rolloverInsert ? { rolloverInsert } : {}),
});

const ctx = { dbGeneral: {} } as AutumnContext;

const resetApplicationHarnesses = [
	{
		name: "FullSubject",
		apply: async ({
			customerEntitlement,
			result,
			skipped,
		}: {
			customerEntitlement: MutableCustomerEntitlement;
			result: ProcessResetResult;
			skipped: string[];
		}) =>
			applyResetResultsToFullSubject({
				ctx,
				fullSubject: {
					customer_products: [],
					extra_customer_entitlements: [customerEntitlement],
				} as unknown as FullSubject,
				computed: [
					{
						customerEntitlementId: CUSTOMER_ENTITLEMENT_ID,
						result,
					},
				],
				skipped,
			}),
	},
	{
		name: "FullCustomer",
		apply: async ({
			customerEntitlement,
			result,
			skipped,
		}: {
			customerEntitlement: MutableCustomerEntitlement;
			result: ProcessResetResult;
			skipped: string[];
		}) =>
			applyResetResults({
				ctx,
				fullCus: {
					customer_products: [],
					extra_customer_entitlements: [customerEntitlement],
				} as unknown as FullCustomer,
				computed: [
					{
						cusEntId: CUSTOMER_ENTITLEMENT_ID,
						result,
					},
				],
				skipped,
			}),
	},
] as const;

afterEach(() => {
	mock.restore();
});

for (const harness of resetApplicationHarnesses) {
	describe(harness.name, () => {
		test("refreshes authoritative rollovers for a skipped reset without a rollover insert", async () => {
			const customerEntitlement = createCustomerEntitlement();
			const getCurrentRollovers = spyOn(
				RolloverService,
				"getCurrentRollovers",
			).mockResolvedValue([authoritativeRollover]);
			const clearExcessRollovers = spyOn(
				RolloverService,
				"clearExcessRollovers",
			).mockResolvedValue({ rollovers: [], deletedIds: [], overwrites: [] });

			await harness.apply({
				customerEntitlement,
				result: resetResult(),
				skipped: [CUSTOMER_ENTITLEMENT_ID],
			});

			expect(customerEntitlement.rollovers).toEqual([authoritativeRollover]);
			expect(getCurrentRollovers).toHaveBeenCalledTimes(1);
			expect(getCurrentRollovers.mock.calls[0]?.[0].cusEntID).toBe(
				CUSTOMER_ENTITLEMENT_ID,
			);
			expect(clearExcessRollovers).not.toHaveBeenCalled();
		});

		test("preserves winner rollover clearing", async () => {
			const customerEntitlement = createCustomerEntitlement();
			const winnerRollover = {
				...authoritativeRollover,
				id: "roll_winner",
			};
			const getCurrentRollovers = spyOn(
				RolloverService,
				"getCurrentRollovers",
			).mockResolvedValue([authoritativeRollover]);
			const clearExcessRollovers = spyOn(
				RolloverService,
				"clearExcessRollovers",
			).mockResolvedValue({
				rollovers: [winnerRollover],
				deletedIds: [],
				overwrites: [],
			});

			await harness.apply({
				customerEntitlement,
				result: resetResult({
					rolloverInsert: {
						rows: [winnerRollover],
						fullCusEnt: customerEntitlement as never,
						startingBalanceOverride: 300,
					},
				}),
				skipped: [],
			});

			expect(customerEntitlement.rollovers).toEqual([winnerRollover]);
			expect(clearExcessRollovers).toHaveBeenCalledTimes(1);
			expect(clearExcessRollovers.mock.calls[0]?.[0]).toMatchObject({
				newRows: [winnerRollover],
				startingBalanceOverride: 300,
			});
			expect(getCurrentRollovers).not.toHaveBeenCalled();
		});
	});
}
