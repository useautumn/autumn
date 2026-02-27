import { expect } from "bun:test";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import { similarUnix } from "@/internal/customers/attach/mergeUtils/phaseUtils/phaseUtils";
import { formatUnixToDateTime } from "@/utils/genUtils";
import {
	compareItems,
	normalizeActualPhaseItem,
	normalizeExpectedPhaseItem,
} from "./compareItems";

/** Validates that actual Stripe schedule phases match the expected phases. */
export const validateSchedulePhases = async ({
	ctx,
	sub,
	scheduledPhases,
	debug,
}: {
	ctx: TestContext;
	sub: Stripe.Subscription;
	scheduledPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	debug?: boolean;
}) => {
	if (!sub.schedule) return;

	const scheduleId =
		typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id;

	const schedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
		scheduleId,
		{ expand: ["phases.items.price"] },
	);

	for (let i = 0; i < scheduledPhases.length; i++) {
		const expectedPhase = scheduledPhases[i];
		const expectedStartSeconds = expectedPhase.start_date as number;

		const actualPhase = schedule.phases.find((phase) =>
			similarUnix({
				unix1: expectedStartSeconds * 1000,
				unix2: phase.start_date * 1000,
			}),
		);

		if (!actualPhase) {
			console.error(
				`No matching schedule phase found for expected phase ${i} starting at ${formatUnixToDateTime(expectedStartSeconds * 1000)}`,
			);
			console.error(
				`Available phases:`,
				schedule.phases.map((p) => ({
					start: formatUnixToDateTime(p.start_date * 1000),
					end: formatUnixToDateTime(p.end_date * 1000),
					items: p.items.length,
				})),
			);
		}

		expect(
			actualPhase,
			`No matching phase at ${formatUnixToDateTime(expectedStartSeconds * 1000)}`,
		).toBeDefined();

		if (!actualPhase) continue;

		const expectedItems = (expectedPhase.items ?? []).map((item) =>
			normalizeExpectedPhaseItem({ item }),
		);
		const actualItems = actualPhase.items.map((item) =>
			normalizeActualPhaseItem({ item }),
		);

		compareItems({
			expectedItems,
			actualItems,
			label: `schedule phase ${i} (${formatUnixToDateTime(expectedStartSeconds * 1000)})`,
			debug,
		});
	}
};
