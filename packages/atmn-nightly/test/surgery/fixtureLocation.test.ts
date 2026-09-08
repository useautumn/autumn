/**
 * Where a fixture literal lives on disk — the piece a lint finding needs to
 * turn "feature x is wrong" into "open this file, this line".
 */

import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fixtureLocation } from "../../src/surgery/fixtureLocation";

const dir = `${import.meta.dir}/.tmp/fixtureLocation`;

const setup = ({
	config,
	files = {},
}: {
	config: string;
	files?: Record<string, string>;
}): string => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	const configPath = `${dir}/autumn.config.ts`;
	writeFileSync(configPath, config, "utf8");
	for (const [name, source] of Object.entries(files)) {
		const path = `${dir}/${name}`;
		mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
		writeFileSync(path, source, "utf8");
	}
	return configPath;
};

test("a fixture in the config file itself is found on its own line", () => {
	const configPath = setup({
		config: [
			'import { atmn, feature } from "atmn";',
			"",
			"export default atmn({",
			"\tfeatures: [",
			'\t\tfeature({ featureId: "seats", name: "Seats", type: "boolean" }),',
			"\t],",
			"});",
			"",
		].join("\n"),
	});

	expect(
		fixtureLocation({
			configPath,
			builder: "feature",
			idField: "featureId",
			id: "seats",
		}),
	).toEqual({ file: "autumn.config.ts", line: 5 });
});

test("a fixture in a nested file is found by its path relative to the config", () => {
	const configPath = setup({
		config: [
			'import { atmn } from "atmn";',
			'import { messages } from "./fixtures/nested/messages";',
			"",
			"export default atmn({",
			"\tfeatures: [messages],",
			"});",
			"",
		].join("\n"),
		files: {
			"fixtures/nested/messages.ts": [
				'import { feature } from "atmn";',
				"",
				"export const messages = feature({",
				'\tfeatureId: "messages",',
				'\tname: "Messages",',
				'\ttype: "metered",',
				"\tconsumable: true,",
				"});",
				"",
			].join("\n"),
		},
	});

	expect(
		fixtureLocation({
			configPath,
			builder: "feature",
			idField: "featureId",
			id: "messages",
		}),
	).toEqual({ file: "fixtures/nested/messages.ts", line: 3 });
});

test("an id that names no fixture returns null", () => {
	const configPath = setup({
		config: [
			'import { atmn, feature } from "atmn";',
			"",
			"export default atmn({",
			"\tfeatures: [",
			'\t\tfeature({ featureId: "seats", name: "Seats", type: "boolean" }),',
			"\t],",
			"});",
			"",
		].join("\n"),
	});

	expect(
		fixtureLocation({
			configPath,
			builder: "feature",
			idField: "featureId",
			id: "nope",
		}),
	).toBeNull();
});
