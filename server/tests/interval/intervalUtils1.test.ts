import { BillingInterval } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { expect } from "chai";
import { describe, it } from "mocha";
import {
	addIntervalForProration,
	subtractIntervalForProration,
} from "@/internal/products/prices/billingIntervalUtils.js";

describe("Billing Interval Utils - Stripe-like behavior", () => {
	describe("addIntervalForProration", () => {
		describe("Sep 30 anchor", () => {
			const sep30_2024 = new UTCDate("2024-09-30T12:00:00Z").getTime();

			it("Sep 30 -> Oct 30", () => {
				const result = addIntervalForProration({
					unixTimestamp: sep30_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 1 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-10-30",
				);
			});

			it("Sep 30 -> Nov 30", () => {
				const result = addIntervalForProration({
					unixTimestamp: sep30_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 2 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-11-30",
				);
			});

			it("Sep 30 -> Dec 30", () => {
				const result = addIntervalForProration({
					unixTimestamp: sep30_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 3 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-12-30",
				);
			});

			it("Sep 30 -> Jan 30 (next year)", () => {
				const result = addIntervalForProration({
					unixTimestamp: sep30_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 4 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2025-01-30",
				);
			});

			it("Sep 30 -> Feb 28 (next year, non-leap)", () => {
				const result = addIntervalForProration({
					unixTimestamp: sep30_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 5 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2025-02-28",
				);
			});

			it("Sep 30 -> Feb 29 (leap year)", () => {
				const sep30_2023 = new UTCDate("2023-09-30T12:00:00Z").getTime();
				const result = addIntervalForProration({
					unixTimestamp: sep30_2023,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 5 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-02-29",
				);
			});
		});

		describe("Aug 31 anchor", () => {
			const aug31_2024 = new UTCDate("2024-08-31T12:00:00Z").getTime();

			it("Aug 31 -> Sep 30", () => {
				const result = addIntervalForProration({
					unixTimestamp: aug31_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 1 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-09-30",
				);
			});

			it("Aug 31 -> Oct 31", () => {
				const result = addIntervalForProration({
					unixTimestamp: aug31_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 2 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-10-31",
				);
			});

			it("Aug 31 -> Nov 30", () => {
				const result = addIntervalForProration({
					unixTimestamp: aug31_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 3 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-11-30",
				);
			});

			it("Aug 31 -> Dec 31", () => {
				const result = addIntervalForProration({
					unixTimestamp: aug31_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 4 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-12-31",
				);
			});

			it("Aug 31 -> Jan 31 (next year)", () => {
				const result = addIntervalForProration({
					unixTimestamp: aug31_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 5 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2025-01-31",
				);
			});

			it("Aug 31 -> Feb 28 (next year, non-leap)", () => {
				const result = addIntervalForProration({
					unixTimestamp: aug31_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 6 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2025-02-28",
				);
			});
		});

		describe("Time preservation", () => {
			it("preserves time components", () => {
				const sep30_1430 = new UTCDate("2024-09-30T14:30:45Z").getTime();
				const result = addIntervalForProration({
					unixTimestamp: sep30_1430,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 1 },
				});
				const resultDate = new UTCDate(result);
				expect(resultDate.toISOString()).to.equal("2024-10-30T14:30:45.000Z");
			});
		});
	});

	describe("subtractIntervalForProration", () => {
		describe("Oct 30 anchor (going backwards to Sep 30)", () => {
			const oct30_2024 = new UTCDate("2024-10-30T12:00:00Z").getTime();

			it("Oct 30 -> Sep 30", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: oct30_2024,
					interval: BillingInterval.Month,
					intervalCount: 1,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-09-30",
				);
			});

			it("Oct 30 -> Aug 30", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: oct30_2024,
					interval: BillingInterval.Month,
					intervalCount: 2,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-08-30",
				);
			});
		});

		describe("Feb 28 anchor (going backwards)", () => {
			const feb28_2025 = new UTCDate("2025-02-28T12:00:00Z").getTime();

			it("Feb 28 -> Jan 28", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: feb28_2025,
					interval: BillingInterval.Month,
					intervalCount: 1,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2025-01-28",
				);
			});

			it("Feb 28 -> Dec 28 (previous year)", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: feb28_2025,
					interval: BillingInterval.Month,
					intervalCount: 2,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-12-28",
				);
			});
		});

		describe("Sep 30 anchor (going backwards from Sep 30)", () => {
			const sep30_2024 = new UTCDate("2024-09-30T12:00:00Z").getTime();

			it("Sep 30 -> Aug 30", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: sep30_2024,
					interval: BillingInterval.Month,
					intervalCount: 1,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-08-30",
				);
			});

			it("Sep 30 -> Jul 30", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: sep30_2024,
					interval: BillingInterval.Month,
					intervalCount: 2,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-07-30",
				);
			});

			it("Sep 30 -> Jun 30", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: sep30_2024,
					interval: BillingInterval.Month,
					intervalCount: 3,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-06-30",
				);
			});

			it("Sep 30 -> May 30", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: sep30_2024,
					interval: BillingInterval.Month,
					intervalCount: 4,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-05-30",
				);
			});

			it("Sep 30 -> Apr 30", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: sep30_2024,
					interval: BillingInterval.Month,
					intervalCount: 5,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-04-30",
				);
			});

			it("Sep 30 -> Mar 30", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: sep30_2024,
					interval: BillingInterval.Month,
					intervalCount: 6,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-03-30",
				);
			});

			it("Sep 30 -> Feb 29 (leap year)", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: sep30_2024,
					interval: BillingInterval.Month,
					intervalCount: 7,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-02-29",
				);
			});
		});

		describe("Jan 31 anchor (going backwards from Jan 31)", () => {
			const jan31_2025 = new UTCDate("2025-01-31T12:00:00Z").getTime();

			it("Jan 31 -> Dec 31 (previous year)", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: jan31_2025,
					interval: BillingInterval.Month,
					intervalCount: 1,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-12-31",
				);
			});

			it("Jan 31 -> Nov 30 (previous year)", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: jan31_2025,
					interval: BillingInterval.Month,
					intervalCount: 2,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-11-30",
				);
			});

			it("Jan 31 -> Oct 31 (previous year)", () => {
				const result = subtractIntervalForProration({
					unixTimestamp: jan31_2025,
					interval: BillingInterval.Month,
					intervalCount: 3,
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-10-31",
				);
			});
		});

		describe("Time preservation", () => {
			it("preserves time components", () => {
				const oct30_1430 = new UTCDate("2024-10-30T14:30:45Z").getTime();
				const result = subtractIntervalForProration({
					unixTimestamp: oct30_1430,
					interval: BillingInterval.Month,
					intervalCount: 1,
				});
				const resultDate = new UTCDate(result);
				expect(resultDate.toISOString()).to.equal("2024-09-30T14:30:45.000Z");
			});
		});
	});

	describe("Edge cases", () => {
		describe("Leap year handling", () => {
			it("Feb 29 -> Mar 29 (leap year)", () => {
				const feb29_2024 = new UTCDate("2024-02-29T12:00:00Z").getTime();
				const result = addIntervalForProration({
					unixTimestamp: feb29_2024,
					intervalConfig: { interval: BillingInterval.Month, intervalCount: 1 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-03-29",
				);
			});

			it("Feb 29 -> Feb 28 (next year, non-leap)", () => {
				const feb29_2024 = new UTCDate("2024-02-29T12:00:00Z").getTime();
				const result = addIntervalForProration({
					unixTimestamp: feb29_2024,
					intervalConfig: {
						interval: BillingInterval.Month,
						intervalCount: 12,
					},
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2025-02-28",
				);
			});
		});

		describe("Quarterly intervals", () => {
			it("Jan 31 -> Apr 30 (quarterly)", () => {
				const jan31_2024 = new UTCDate("2024-01-31T12:00:00Z").getTime();
				const result = addIntervalForProration({
					unixTimestamp: jan31_2024,
					intervalConfig: {
						interval: BillingInterval.Quarter,
						intervalCount: 1,
					},
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2024-04-30",
				);
			});

			it("Oct 31 -> Jan 31 (quarterly)", () => {
				const oct31_2024 = new UTCDate("2024-10-31T12:00:00Z").getTime();
				const result = addIntervalForProration({
					unixTimestamp: oct31_2024,
					intervalConfig: {
						interval: BillingInterval.Quarter,
						intervalCount: 1,
					},
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2025-01-31",
				);
			});
		});

		describe("Yearly intervals", () => {
			it("Feb 29 -> Feb 28 (yearly, non-leap to leap)", () => {
				const feb29_2024 = new UTCDate("2024-02-29T12:00:00Z").getTime();
				const result = addIntervalForProration({
					unixTimestamp: feb29_2024,
					intervalConfig: { interval: BillingInterval.Year, intervalCount: 1 },
				});
				expect(new UTCDate(result).toISOString().slice(0, 10)).to.equal(
					"2025-02-28",
				);
			});
		});
	});
});
