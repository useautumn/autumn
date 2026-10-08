import { beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod/v4";
import {
	onUnknownInput,
	openEnum,
	openSchema,
	type UnknownInput,
} from "../../../src/models/common/openSchema.js";

const sightings: UnknownInput[] = [];
beforeEach(() => {
	sightings.length = 0;
	onUnknownInput((input) => sightings.push(input));
});

describe("openEnum", () => {
	const colour = openEnum({ name: "colour", values: ["red", "blue"] });

	test("parses a known value as itself and an unknown one as the string it is", () => {
		expect(colour.parse("red")).toBe("red");
		expect<string>(colour.parse("teal")).toBe("teal");
	});

	test("refuses anything that is not a string", () => {
		expect(colour.safeParse(3).success).toBe(false);
		expect(colour.safeParse(null).success).toBe(false);
	});

	test("reports an unknown value once per process, and a known value never", () => {
		colour.parse("red");
		colour.parse("mauve");
		colour.parse("mauve");
		openEnum({ name: "colour", values: ["red", "blue"] }).parse("mauve");

		expect(sightings).toEqual([
			{ kind: "enum_value", schema: "colour", value: "mauve" },
		]);
	});

	test("a listener that throws does not fail the parse", () => {
		onUnknownInput(() => {
			throw new Error("sink is down");
		});

		expect<string>(colour.parse("ochre")).toBe("ochre");
	});
});

describe("openSchema", () => {
	enum Tier {
		Free = "free",
		Pro = "pro",
	}
	const row = z.object({
		id: z.string(),
		tier: z.enum(Tier),
		processor: z
			.object({ type: z.enum(["stripe"]), id: z.string() })
			.nullable(),
		tags: z.array(z.object({ key: z.string() })).default([]),
		limits: z.record(z.string(), z.object({ interval: z.enum(["day"]) })),
		config: z.discriminatedUnion("kind", [
			z.object({ kind: z.literal("fixed"), amount: z.number() }),
			z.object({ kind: z.literal("usage"), tiers: z.array(z.number()) }),
		]),
		note: z.string().min(1).optional(),
	});
	const open = openSchema({ name: "row", schema: row });

	const known = {
		id: "r_1",
		tier: "pro",
		processor: { type: "stripe", id: "cus_1" },
		tags: [{ key: "a" }],
		limits: { seats: { interval: "day" } },
		config: { kind: "fixed", amount: 5 },
	};

	test("parses what the original parses, to the same value", () => {
		expect(open.parse(known)).toEqual(row.parse(known));
	});

	test("keeps unknown keys at every depth", () => {
		const newer = {
			...known,
			futureField: 1,
			processor: { ...known.processor, futureField: 2 },
			tags: [{ key: "a", futureField: 3 }],
			limits: { seats: { interval: "day", futureField: 4 } },
			config: { kind: "fixed", amount: 5, futureField: 5 },
		};

		expect<unknown>(open.parse(newer)).toEqual(newer);
	});

	test("accepts unknown enum values at every depth and names each by its path", () => {
		const newer = {
			...known,
			tier: "enterprise",
			processor: { type: "paddle", id: "cus_1" },
			limits: { seats: { interval: "fortnight" } },
		};

		expect<unknown>(open.parse(newer)).toEqual(newer);
		expect(sightings).toEqual([
			{ kind: "enum_value", schema: "row.tier", value: "enterprise" },
			{ kind: "enum_value", schema: "row.processor.type", value: "paddle" },
			{
				kind: "enum_value",
				schema: "row.limits{}.interval",
				value: "fortnight",
			},
		]);
	});

	test("still discriminates a union and refuses a wrong type or a failed check", () => {
		expect(
			open.safeParse({ ...known, config: { kind: "other" } }).success,
		).toBe(false);
		expect(open.safeParse({ ...known, id: 1 }).success).toBe(false);
		expect(open.safeParse({ ...known, note: "" }).success).toBe(false);
		expect(open.parse({ ...known, note: "n" }).note).toBe("n");
	});

	test("keeps defaults and the original's shape", () => {
		const { tags: _tags, ...withoutTags } = known;

		expect(open.parse(withoutTags).tags).toEqual([]);
		expect(Object.keys(open.shape)).toEqual(Object.keys(row.shape));
	});
});
