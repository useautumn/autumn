import { SYNCED_LISTS } from "../../../generated/emit";
import { deleteFixtureLiteral } from "../../../surgery/deleteFixtureLiteral";
import { deleteReference } from "../../../surgery/deleteReference";
import { fixtureObjectOf } from "../../../surgery/findFixture";
import { patchFixturePaths } from "../../../surgery/patchFixturePaths";
import {
	fixtureKeyOf,
	readFixtureValue,
} from "../../../surgery/readFixtureValue";
import { resolveCollectionTarget } from "../resolveCollectionTarget";
import { locateWebhook } from "./locateWebhook";
import type { PullFiles, StatedWebhook, WebhookEditResult } from "./types";
import { nonLiteralUrlWarning } from "./updateWebhook";

const SPEC = SYNCED_LISTS.webhooks;

/** Read from source, not the evaluated config: a key whose code evaluates to
 * undefined is still a key the user wrote. */
const urlMapIsEmpty = ({
	pull,
	id,
}: {
	pull: PullFiles;
	id: string;
}): boolean => {
	const located = locateWebhook({ pull, id });
	const object = located === null ? null : fixtureObjectOf(located.node);
	const member = object
		?.namedChildren()
		.find(
			(child) =>
				child.kind() === "pair" &&
				child.field("key") !== null &&
				fixtureKeyOf({ node: child.field("key") as never }) === "url",
		);
	const value = member?.field("value");
	if (value === null || value === undefined) return false;
	const read = readFixtureValue({ node: value });
	return (
		typeof read === "object" && read !== null && Object.keys(read).length === 0
	);
};

/** The whole `webhook({...})`, and any export reference left pointing at it. */
const deleteWebhook = ({
	pull,
	id,
}: {
	pull: PullFiles;
	id: string;
}): boolean => {
	const located = locateWebhook({ pull, id });
	if (located === null) return false;
	const removed = deleteFixtureLiteral({
		source: located.source,
		builder: SPEC.builder,
		idField: SPEC.idField,
		id,
	});
	if (removed === null) return false;
	pull.files.set(located.file, removed.source);
	if (removed.exportedName !== undefined) {
		const referenceFiles = new Set([pull.configPath]);
		const target = resolveCollectionTarget({
			configPath: pull.configPath,
			files: pull.files,
			collection: "webhooks",
		});
		if (target !== null) referenceFiles.add(target.file);
		for (const file of referenceFiles)
			pull.files.set(
				file,
				deleteReference({
					source: pull.files.get(file) ?? "",
					name: removed.exportedName,
				}),
			);
	}
	return true;
};

/**
 * Rule 4: the server has no such webhook in this env, so the env's key goes;
 * a map left empty registers the webhook nowhere, so the webhook goes too.
 */
export const removeWebhookEnv = ({
	pull,
	stated,
	envKey,
}: {
	pull: PullFiles;
	stated: StatedWebhook;
	envKey: string;
}): WebhookEditResult => {
	const result: WebhookEditResult = { lines: [], warnings: [], unlocated: [] };
	const located = locateWebhook({ pull, id: stated.id });
	const patched =
		located === null
			? null
			: patchFixturePaths({
					source: located.source,
					builder: SPEC.builder,
					idField: SPEC.idField,
					id: stated.id,
					assignments: [{ path: ["url", envKey], text: null }],
				});
	if (located === null || patched === null) {
		result.unlocated.push({
			id: stated.id,
			action: `remove url.${envKey} by hand`,
		});
		return result;
	}
	if (patched.skipped.length > 0) {
		result.warnings.push(
			nonLiteralUrlWarning({
				id: stated.id,
				envKey,
				server: undefined,
				config: stated.url?.[envKey],
			}),
		);
		return result;
	}
	if (patched.source === located.source) return result;
	pull.files.set(located.file, patched.source);
	if (urlMapIsEmpty({ pull, id: stated.id })) {
		if (deleteWebhook({ pull, id: stated.id })) {
			result.lines.push(`- webhook ${stated.id}`);
			return result;
		}
		// Only a literal can be deleted; saying so beats leaving `url: {}` behind.
		result.unlocated.push({
			id: stated.id,
			action: "delete the webhook by hand: its url map is now empty",
		});
		return result;
	}
	result.lines.push(`- webhook ${stated.id} url.${envKey}`);
	return result;
};
