import { describe, expect, test } from "bun:test";
import {
	graduatedTiersToLineBands,
	Infinite,
	type UsageTier,
	volumeTiersToLineBands,
} from "@autumn/shared";

const TIERS = [
	{ to: 100, amount: 1 },
	{ to: 200, amount: 0.8 },
	{ to: Infinite, amount: 0.5 },
] as UsageTier[];

const FLAT_TIERS = [
	{ to: 100, amount: 0.4, flat_amount: 5 },
	{ to: Infinite, amount: 0.25, flat_amount: 20 },
] as UsageTier[];

describe("graduatedTiersToLineBands", () => {
	test("splits 250 units across three bands at their own rates", () => {
		expect(graduatedTiersToLineBands({ tiers: TIERS, usage: 250 })).toEqual([
			{
				kind: "usage",
				tierStart: 0,
				tierEnd: 100,
				quantity: 100,
				unitAmount: 1,
				amount: 100,
			},
			{
				kind: "usage",
				tierStart: 100,
				tierEnd: 200,
				quantity: 100,
				unitAmount: 0.8,
				amount: 80,
			},
			{
				kind: "usage",
				tierStart: 200,
				tierEnd: null,
				quantity: 50,
				unitAmount: 0.5,
				amount: 25,
			},
		]);
	});

	test("included usage shifts band positions to total usage, not the quantities", () => {
		const bands = graduatedTiersToLineBands({
			tiers: TIERS,
			usage: 150,
			allowance: 100,
		});
		expect(
			bands.map((band) => [band.tierStart, band.tierEnd, band.quantity]),
		).toEqual([
			[100, 200, 100],
			[200, 300, 50],
		]);
	});

	test("billing units round usage up and charge the pack rate per unit", () => {
		const bands = graduatedTiersToLineBands({
			tiers: [{ to: Infinite, amount: 5 }] as UsageTier[],
			usage: 250,
			billingUnits: 100,
		});
		expect(bands).toEqual([
			{
				kind: "usage",
				tierStart: 0,
				tierEnd: null,
				quantity: 300,
				unitAmount: 5,
				amount: 15,
			},
		]);
	});

	test("zero usage has no bands", () => {
		expect(graduatedTiersToLineBands({ tiers: TIERS, usage: 0 })).toEqual([]);
	});
});

describe("volumeTiersToLineBands", () => {
	test("all usage lands in one band", () => {
		expect(volumeTiersToLineBands({ tiers: TIERS, usage: 150 })).toEqual([
			{
				kind: "usage",
				tierStart: 100,
				tierEnd: 200,
				quantity: 150,
				unitAmount: 0.8,
				amount: 120,
			},
		]);
	});

	test("100 included, 150 used: every unit at the band total usage lands in ($75)", () => {
		const bands = volumeTiersToLineBands({
			tiers: [
				{ to: 40, amount: 1 },
				{ to: Infinite, amount: 0.5 },
			] as UsageTier[],
			usage: 150,
			allowance: 100,
		});
		expect(bands).toEqual([
			{
				kind: "usage",
				tierStart: 140,
				tierEnd: null,
				quantity: 150,
				unitAmount: 0.5,
				amount: 75,
			},
		]);
	});

	test("a tier's flat fee is its own band", () => {
		expect(volumeTiersToLineBands({ tiers: FLAT_TIERS, usage: 300 })).toEqual([
			{
				kind: "usage",
				tierStart: 100,
				tierEnd: null,
				quantity: 300,
				unitAmount: 0.25,
				amount: 75,
			},
			{
				kind: "flat_fee",
				tierStart: 100,
				tierEnd: null,
				quantity: 1,
				unitAmount: 20,
				amount: 20,
			},
		]);
	});
});
