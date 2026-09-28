import { SYNCED_LISTS } from "../../../generated/emit";
import { deleteFixtureLiteral } from "../../../surgery/deleteFixtureLiteral";
import { deleteReference } from "../../../surgery/deleteReference";
import { resolveCollectionTarget } from "../resolveCollectionTarget";
import { locateWebhook, webhookWhere } from "./locateWebhook";
import type { PullFiles, StatedWebhook, WebhookEditResult } from "./types";

const SPEC = SYNCED_LISTS.webhooks;

/** The server has no such endpoint in this env: its entry goes, with any export reference left pointing at it. */
export const deleteWebhook = ({
	pull,
	stated,
	envKey,
}: {
	pull: PullFiles;
	stated: StatedWebhook;
	envKey: string;
}): WebhookEditResult => {
	const result: WebhookEditResult = { lines: [], warnings: [], unlocated: [] };
	const located = locateWebhook({ pull, id: stated.id, envKey });
	const removed =
		located === null
			? null
			: deleteFixtureLiteral({
					source: located.source,
					builder: SPEC.builder,
					idField: SPEC.idField,
					id: stated.id,
					where: webhookWhere({ envKey }),
				});
	if (located === null || removed === null) {
		result.unlocated.push({
			id: stated.id,
			action: `delete the ${envKey} webhook by hand`,
		});
		return result;
	}
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
	result.lines.push(`- webhook ${stated.id} (${envKey})`);
	return result;
};
