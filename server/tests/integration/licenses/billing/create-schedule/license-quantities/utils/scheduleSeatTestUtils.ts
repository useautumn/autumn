import type {
	BillingPreviewResponse,
	CreateScheduleParamsV0Input,
} from "@autumn/shared";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { addHours, addMonths } from "date-fns";
import type { AutumnInt } from "@/external/autumn/autumnCli";

export const PARENT_PRICE = 100;
export const SEAT_PRICE = 10;

/** A priced parent plan plus the priced seat license it links. */
export const buildSeatPlans = ({ prefix }: { prefix: string }) => {
	const parent = products.base({
		id: `${prefix}-parent`,
		group: `${prefix}-parent`,
		items: [items.monthlyPrice({ price: PARENT_PRICE }), items.dashboard()],
	});
	const seat = products.base({
		id: `${prefix}-seat`,
		group: `${prefix}-seat`,
		items: [items.monthlyPrice({ price: SEAT_PRICE })],
	});

	return { parent, seat };
};

export const seatPhaseTotal = ({ paidSeats }: { paidSeats: number }) =>
	PARENT_PRICE + paidSeats * SEAT_PRICE;

export const previewCreateSchedule = async ({
	autumnV1,
	params,
}: {
	autumnV1: AutumnInt;
	params: CreateScheduleParamsV0Input;
}): Promise<BillingPreviewResponse & { total: number }> =>
	await autumnV1.post("/billing.preview_create_schedule", params);

/** Advances past the next monthly boundary and lets its invoice finalize. */
export const advanceToNextPhase = async ({
	scenario,
}: {
	scenario: {
		ctx: TestContext;
		testClockId?: string;
		advancedTo: number;
	};
}) => {
	if (!scenario.testClockId) throw new Error("Expected a test clock");
	const phaseStart = addMonths(new Date(scenario.advancedTo), 1);

	await advanceTestClock({
		stripeCli: scenario.ctx.stripeCli,
		testClockId: scenario.testClockId,
		advanceTo: phaseStart.getTime(),
		waitForSeconds: 10,
	});
	await advanceTestClock({
		stripeCli: scenario.ctx.stripeCli,
		testClockId: scenario.testClockId,
		advanceTo: addHours(phaseStart, hoursToFinalizeInvoice).getTime(),
		waitForSeconds: 10,
	});
};
