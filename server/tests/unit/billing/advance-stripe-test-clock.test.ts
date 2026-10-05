import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import Stripe from "stripe";
import { advanceStripeTestClock } from "../../../src/external/stripe/testClocks/advanceStripeTestClock";

const currentTime = 1800000000;
const clock = {
	id: "clock_123",
	frozen_time: currentTime,
	status: "ready",
} as Stripe.TestHelpers.TestClock;

const attachedClock = {
	id: "clock_attached",
	frozen_time: currentTime,
	status: "ready",
} as Stripe.TestHelpers.TestClock;
const unclockedCustomer = {
	id: "cus_123",
	livemode: false,
	test_clock: null,
} as Stripe.Customer;

const setup = ({
	customer = {
		id: "cus_123",
		livemode: false,
		test_clock: clock,
	} as Stripe.Customer,
}: {
	customer?: Stripe.Customer | Stripe.DeletedCustomer;
} = {}) => {
	const stripe = new Stripe("test-api-key");
	const retrieve = spyOn(stripe.customers, "retrieve").mockResolvedValue(
		customer as Stripe.Response<Stripe.Customer | Stripe.DeletedCustomer>,
	);
	const create = spyOn(
		stripe.testHelpers.testClocks,
		"create",
	).mockResolvedValue({
		...attachedClock,
		status: "advancing",
	} as Stripe.Response<Stripe.TestHelpers.TestClock>);
	const retrieveClock = spyOn(
		stripe.testHelpers.testClocks,
		"retrieve",
	).mockResolvedValue(
		attachedClock as Stripe.Response<Stripe.TestHelpers.TestClock>,
	);
	const advance = spyOn(
		stripe.testHelpers.testClocks,
		"advance",
	).mockResolvedValue({
		...clock,
		frozen_time: currentTime + 1,
		status: "advancing",
	} as Stripe.Response<Stripe.TestHelpers.TestClock>);
	return { stripe, retrieve, create, retrieveClock, advance };
};

beforeEach(() => spyOn(Date, "now").mockReturnValue(currentTime * 1000));
afterEach(() => mock.restore());

describe("advance Stripe test clock", () => {
	test("uses one expanded customer read and floors milliseconds", async () => {
		const { stripe, retrieve, advance } = setup();
		const result = await advanceStripeTestClock({
			stripe,
			stripeCustomerId: "cus_123",
			frozenTime: (currentTime + 1) * 1000 + 999,
		});
		expect(retrieve).toHaveBeenCalledTimes(1);
		expect(retrieve).toHaveBeenCalledWith("cus_123", {
			expand: ["test_clock"],
		});
		expect(advance).toHaveBeenCalledWith("clock_123", {
			frozen_time: currentTime + 1,
		});
		expect(result.status).toBe("advancing");
	});
	test.each([
		currentTime * 1000 - 1,
		currentTime * 1000,
		currentTime * 1000 + 999,
	])("rejects non-future target %s after rounding", async (frozenTime) => {
		const { stripe, advance } = setup();
		await expect(
			advanceStripeTestClock({
				stripe,
				stripeCustomerId: "cus_123",
				frozenTime,
			}),
		).rejects.toThrow("later than");
		expect(advance).not.toHaveBeenCalled();
	});
	test.each([
		{ id: "cus_123", deleted: true },
		{ id: "cus_123", livemode: true, test_clock: clock },
		{ id: "cus_123", livemode: false, test_clock: "clock_123" },
	])("rejects unusable Stripe customer %j", async (customer) => {
		const { stripe, advance } = setup({
			customer: customer as Stripe.Customer | Stripe.DeletedCustomer,
		});
		await expect(
			advanceStripeTestClock({
				stripe,
				stripeCustomerId: "cus_123",
				frozenTime: (currentTime + 1) * 1000,
			}),
		).rejects.toThrow();
		expect(advance).not.toHaveBeenCalled();
	});
	test("passes Stripe advancement failures through without checking status locally", async () => {
		const { stripe, advance } = setup({
			customer: {
				id: "cus_123",
				livemode: false,
				test_clock: { ...clock, status: "advancing" },
			} as Stripe.Customer,
		});
		const error = new Error("Stripe clock limit or status rejection");
		advance.mockRejectedValue(error);
		await expect(
			advanceStripeTestClock({
				stripe,
				stripeCustomerId: "cus_123",
				frozenTime: (currentTime + 1) * 1000,
			}),
		).rejects.toBe(error);
		expect(advance).toHaveBeenCalledTimes(1);
	});
	test("does not advance when Stripe customer retrieval fails", async () => {
		const { stripe, retrieve, advance } = setup();
		retrieve.mockRejectedValue(new Error("No such customer"));
		await expect(
			advanceStripeTestClock({
				stripe,
				stripeCustomerId: "cus_missing",
				frozenTime: (currentTime + 1) * 1000,
			}),
		).rejects.toThrow("No such customer");
		expect(advance).not.toHaveBeenCalled();
	});

	test("attaches a clock frozen now to an unclocked customer, then advances it", async () => {
		const { stripe, create, retrieveClock, advance } = setup({
			customer: unclockedCustomer,
		});
		await advanceStripeTestClock({
			stripe,
			stripeCustomerId: "cus_123",
			frozenTime: (currentTime + 60) * 1000,
		});
		expect(create).toHaveBeenCalledWith({
			frozen_time: currentTime,
			customer: "cus_123",
		});
		expect(retrieveClock).toHaveBeenCalledWith("clock_attached");
		expect(advance).toHaveBeenCalledWith("clock_attached", {
			frozen_time: currentTime + 60,
		});
	});
	test("rejects a non-future target before attaching a clock", async () => {
		const { stripe, create, advance } = setup({ customer: unclockedCustomer });
		await expect(
			advanceStripeTestClock({
				stripe,
				stripeCustomerId: "cus_123",
				frozenTime: currentTime * 1000,
			}),
		).rejects.toThrow("later than");
		expect(create).not.toHaveBeenCalled();
		expect(advance).not.toHaveBeenCalled();
	});
	test("uses the clock a concurrent request attached when its own attach fails", async () => {
		const { stripe, retrieve, create, advance } = setup({
			customer: unclockedCustomer,
		});
		create.mockRejectedValue(new Error("Customer already has a test clock"));
		retrieve.mockResolvedValueOnce(
			unclockedCustomer as Stripe.Response<Stripe.Customer>,
		);
		retrieve.mockResolvedValueOnce({
			...unclockedCustomer,
			test_clock: attachedClock,
		} as Stripe.Response<Stripe.Customer>);
		await advanceStripeTestClock({
			stripe,
			stripeCustomerId: "cus_123",
			frozenTime: (currentTime + 60) * 1000,
		});
		expect(advance).toHaveBeenCalledWith("clock_attached", {
			frozen_time: currentTime + 60,
		});
	});
	test("surfaces the attach error when no clock was attached concurrently", async () => {
		const { stripe, create, advance } = setup({ customer: unclockedCustomer });
		const error = new Error("Billing Automations are configured");
		create.mockRejectedValue(error);
		await expect(
			advanceStripeTestClock({
				stripe,
				stripeCustomerId: "cus_123",
				frozenTime: (currentTime + 60) * 1000,
			}),
		).rejects.toBe(error);
		expect(advance).not.toHaveBeenCalled();
	});
});
