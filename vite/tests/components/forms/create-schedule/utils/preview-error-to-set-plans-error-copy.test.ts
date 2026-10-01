import { expect, test } from "bun:test";
import { AxiosError, type AxiosResponse } from "axios";
import { previewErrorToSetPlansErrorCopy } from "@/components/forms/create-schedule/utils/previewErrorToSetPlansErrorCopy";

const axiosError = (data: object) =>
	new AxiosError("Request failed", "400", undefined, undefined, {
		data,
		status: 400,
	} as AxiosResponse);

test("an error with details renders the shared copy, bold names and link included", () => {
	const copy = previewErrorToSetPlansErrorCopy(
		axiosError({
			message: "ignored when details are present",
			details: { type: "too_many_phases", phase_count: 12, max_phases: 10 },
		}),
	);

	expect(copy).toEqual({
		line: [
			{ text: "This schedule needs" },
			{ text: "12", bold: true },
			{ text: "phases, but Stripe allows at most" },
			{ text: "10.", bold: true },
		],
		hint: { text: "Remove or merge some phases." },
	});
});

test("an error without details falls back to its message on one line", () => {
	expect([
		previewErrorToSetPlansErrorCopy(
			axiosError({ message: "Card declined", code: "invalid_request" }),
		),
		previewErrorToSetPlansErrorCopy(new Error("Phases overlap")),
		previewErrorToSetPlansErrorCopy(null),
	]).toEqual([
		{ line: [{ text: "Card declined" }] },
		{ line: [{ text: "Phases overlap" }] },
		null,
	]);
});
