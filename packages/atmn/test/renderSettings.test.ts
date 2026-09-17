/**
 * The Settings section reports what organization.preview_update said: a
 * stated flag that moves, and an unstated one the config leaves behind. The
 * unmanaged line is the one place the CLI explains PATCH: nothing is reset by
 * omission, so the way to turn a flag off is to state it off.
 */

import { expect, test } from "bun:test";
import { previewIsEmpty, renderPreview } from "../src/render/renderPreview";

const settingsOnly = (changes: unknown[]) =>
	({
		features: [],
		plans: [],
		settings: { config: { changes } },
		// biome-ignore lint/suspicious/noExplicitAny: the preview shape under test
	}) as any;

test("an update reads as label: previous -> current, with the shared label", () => {
	const output = renderPreview({
		preview: settingsOnly([
			{
				key: "persist_free_overage",
				action: "update",
				previous: false,
				current: true,
			},
		]),
	});
	expect(output).toContain("Settings (1)");
	expect(output).toContain("~ Pay down overages: false -> true");
});

test("an unmanaged flag says how to turn it off", () => {
	const output = renderPreview({
		preview: settingsOnly([
			{
				key: "multi_currency",
				action: "unmanaged",
				previous: true,
				current: null,
			},
		]),
	});
	expect(output).toContain(
		"~ Multi-currency: true -> unmanaged (set false explicitly to disable; atmn won't override)",
	);
});

test("unmanaged flags alone are nothing to apply; an update is", () => {
	expect(
		previewIsEmpty({
			preview: settingsOnly([
				{
					key: "multi_currency",
					action: "unmanaged",
					previous: true,
					current: null,
				},
			]),
		}),
	).toBe(true);
	expect(
		previewIsEmpty({
			preview: settingsOnly([
				{
					key: "multi_currency",
					action: "update",
					previous: false,
					current: true,
				},
			]),
		}),
	).toBe(false);
});

test("no settings lane at all renders as before", () => {
	expect(
		renderPreview({
			// biome-ignore lint/suspicious/noExplicitAny: the preview shape under test
			preview: { features: [], plans: [] } as any,
		}),
	).toContain("No changes.");
});
