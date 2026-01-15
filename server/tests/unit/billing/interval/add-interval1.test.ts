// import { describe, expect, test } from "bun:test";
// import { addInterval, BillingInterval, EntInterval } from "@autumn/shared";
// import { fromUnix, toUnix } from "./test-interval-utils.test";

// describe("add-interval1: adding interval for basic cases", () => {
// 	describe("BillingInterval.Week", () => {
// 		test("adds 1 week", () => {
// 			const from = toUnix({ year: 2024, month: 1, day: 15 }); // Jan 15
// 			const result = addInterval({
// 				from,
// 				interval: BillingInterval.Week,
// 				intervalCount: 1,
// 			});
// 			const { month, day } = fromUnix(result);
// 			expect(month).toBe(1);
// 			expect(day).toBe(22); // Jan 22
// 		});

// 		test("adds 2 weeks", () => {
// 			const from = toUnix({ year: 2024, month: 1, day: 15 });
// 			const result = addInterval({
// 				from,
// 				interval: BillingInterval.Week,
// 				intervalCount: 2,
// 			});
// 			const { month, day } = fromUnix(result);
// 			expect(month).toBe(1);
// 			expect(day).toBe(29);
// 		});

// 		test("adds 1 week crossing month boundary (Jan 28 -> Feb 4)", () => {
// 			const from = toUnix({ year: 2024, month: 1, day: 28 }); // Jan 28
// 			const result = addInterval({
// 				from,
// 				interval: BillingInterval.Week,
// 				intervalCount: 1,
// 			});
// 			const { month, day } = fromUnix(result);
// 			expect(month).toBe(2);
// 			expect(day).toBe(4); // Feb 4
// 		});

// 		test("adds 1 week crossing year boundary (Dec 28 -> Jan 4)", () => {
// 			const from = toUnix({ year: 2024, month: 12, day: 28 }); // Dec 28
// 			const result = addInterval({
// 				from,
// 				interval: BillingInterval.Week,
// 				intervalCount: 1,
// 			});
// 			const { year, month, day } = fromUnix(result);
// 			expect(year).toBe(2025);
// 			expect(month).toBe(1);
// 			expect(day).toBe(4); // Jan 4, 2025
// 		});
// 	});

// 	describe("BillingInterval.Month", () => {
// 		test("adds 1 month to a normal date", () => {
// 			const from = toUnix({ year: 2024, month: 1, day: 15 }); // Jan 15
// 			const result = addInterval({
// 				from,
// 				interval: BillingInterval.Month,
// 				intervalCount: 1,
// 			});
// 			const { month, day } = fromUnix(result);
// 			expect(month).toBe(2);
// 			expect(day).toBe(15); // Feb 15
// 		});

// 		test("adds 3 months", () => {
// 			const from = toUnix({ year: 2024, month: 1, day: 15 });
// 			const result = addInterval({
// 				from,
// 				interval: BillingInterval.Month,
// 				intervalCount: 3,
// 			});
// 			const { month, day } = fromUnix(result);
// 			expect(month).toBe(4);
// 			expect(day).toBe(15); // Apr 15
// 		});

// 		test("adds 1 month crossing year boundary (Dec 28 -> Jan 28)", () => {
// 			const from = toUnix({ year: 2024, month: 12, day: 28 }); // Dec 28
// 			const result = addInterval({
// 				from,
// 				interval: BillingInterval.Month,
// 				intervalCount: 1,
// 			});
// 			const { year, month, day } = fromUnix(result);
// 			expect(year).toBe(2025);
// 			expect(month).toBe(1);
// 			expect(day).toBe(28);
// 		});
// 	});

// 	describe("BillingInterval.Quarter", () => {
// 		test("adds 1 quarter (3 months)", () => {
// 			const from = toUnix({ year: 2024, month: 1, day: 15 });
// 			const result = addInterval({
// 				from,
// 				interval: BillingInterval.Quarter,
// 				intervalCount: 1,
// 			});
// 			const { month, day } = fromUnix(result);
// 			expect(month).toBe(4);
// 			expect(day).toBe(15);
// 		});
// 	});

// 	describe("BillingInterval.SemiAnnual", () => {
// 		test("adds 1 semi-annual (6 months)", () => {
// 			const from = toUnix({ year: 2024, month: 1, day: 15 });
// 			const result = addInterval({
// 				from,
// 				interval: BillingInterval.SemiAnnual,
// 				intervalCount: 1,
// 			});
// 			const { month, day } = fromUnix(result);
// 			expect(month).toBe(7);
// 			expect(day).toBe(15); // Jul 15
// 		});
// 	});

// 	describe("BillingInterval.Year", () => {
// 		test("adds 1 year", () => {
// 			const from = toUnix({ year: 2024, month: 1, day: 15 });
// 			const result = addInterval({
// 				from,
// 				interval: BillingInterval.Year,
// 				intervalCount: 1,
// 			});
// 			const { year, month, day } = fromUnix(result);
// 			expect(year).toBe(2025);
// 			expect(month).toBe(1);
// 			expect(day).toBe(15);
// 		});
// 	});

// 	describe("BillingInterval.OneOff", () => {
// 		test("returns unchanged timestamp", () => {
// 			const from = toUnix({ year: 2024, month: 1, day: 15 });
// 			const result = addInterval({
// 				from,
// 				interval: BillingInterval.OneOff,
// 				intervalCount: 1,
// 			});
// 			expect(result).toBe(from);
// 		});
// 	});

// 	describe("EntInterval fine-grained intervals", () => {
// 		test("adds minutes", () => {
// 			const from = toUnix({
// 				year: 2024,
// 				month: 1,
// 				day: 15,
// 				hour: 12,
// 				minute: 0,
// 				second: 0,
// 			});
// 			const result = addInterval({
// 				from,
// 				interval: EntInterval.Minute,
// 				intervalCount: 30,
// 			});
// 			const { minute } = fromUnix(result);
// 			expect(minute).toBe(30);
// 		});

// 		test("adds hours", () => {
// 			const from = toUnix({
// 				year: 2024,
// 				month: 1,
// 				day: 15,
// 				hour: 12,
// 				minute: 0,
// 				second: 0,
// 			});
// 			const result = addInterval({
// 				from,
// 				interval: EntInterval.Hour,
// 				intervalCount: 5,
// 			});
// 			const { hour } = fromUnix(result);
// 			expect(hour).toBe(17);
// 		});

// 		test("adds days", () => {
// 			const from = toUnix({ year: 2024, month: 1, day: 15 });
// 			const result = addInterval({
// 				from,
// 				interval: EntInterval.Day,
// 				intervalCount: 10,
// 			});
// 			const { day } = fromUnix(result);
// 			expect(day).toBe(25);
// 		});
// 	});

// 	describe("EntInterval.Lifetime", () => {
// 		test("returns unchanged timestamp", () => {
// 			const from = toUnix({ year: 2024, month: 1, day: 15 });
// 			const result = addInterval({
// 				from,
// 				interval: EntInterval.Lifetime,
// 				intervalCount: 1,
// 			});
// 			expect(result).toBe(from);
// 		});
// 	});
// });
