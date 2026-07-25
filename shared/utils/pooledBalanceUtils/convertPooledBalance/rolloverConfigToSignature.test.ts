import { expect, test } from "bun:test";
import { RolloverExpiryDurationType } from "../../../models/productModels/durationTypes/rolloverExpiryDurationType.js";
import { rolloverConfigToSignature } from "./rolloverConfigToSignature.js";

test("rollover signatures ignore object shape and nullish optional fields", () => {
	const compact = rolloverConfigToSignature({
		rollover: {
			max_percentage: 50,
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		},
	});
	const explicit = rolloverConfigToSignature({
		rollover: {
			length: 1,
			max: null,
			duration: RolloverExpiryDurationType.Month,
			max_percentage: 50,
		},
	});

	expect(compact).toBe(explicit);
	expect(rolloverConfigToSignature({ rollover: null })).toBe("none");
	expect(rolloverConfigToSignature({ rollover: undefined })).toBe("none");
});

test("explicit undefined caps match explicit null caps", () => {
	// In-memory construction can set these to undefined rather than omitting them.
	const undefinedCaps = rolloverConfigToSignature({
		rollover: {
			max: undefined,
			max_percentage: undefined,
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		},
	});
	const nullCaps = rolloverConfigToSignature({
		rollover: {
			max: null,
			max_percentage: null,
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		},
	});
	const omittedCaps = rolloverConfigToSignature({
		rollover: {
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		},
	});

	expect(undefinedCaps).toBe(nullCaps);
	expect(undefinedCaps).toBe(omittedCaps);
});

test("rollover signatures preserve valid zero values", () => {
	const zeroMax = rolloverConfigToSignature({
		rollover: {
			max: 0,
			duration: RolloverExpiryDurationType.Forever,
			length: 0,
		},
	});
	const nullMax = rolloverConfigToSignature({
		rollover: {
			max: null,
			duration: RolloverExpiryDurationType.Forever,
			length: 0,
		},
	});

	expect(zeroMax).not.toBe(nullMax);
	expect(zeroMax).toContain("max=0");
	expect(zeroMax).toContain("length=0");
});
