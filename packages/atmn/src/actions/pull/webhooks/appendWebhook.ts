import { SYNCED_LISTS } from "../../../generated/emit";
import { emitFixture } from "../../../generated/emitRuntime";
import { appendToBinding } from "../../../surgery/appendToBinding";
import { appendToCollection } from "../../../surgery/appendToCollection";
import { ensureBuilderImport } from "../../../surgery/ensureBuilderImport";
import {
	insertCollection,
	rootSpreadNames,
} from "../../../surgery/insertCollection";
import { resolveCollectionTarget } from "../resolveCollectionTarget";
import type { PullFiles, RemoteWebhook } from "./types";

const SPEC = SYNCED_LISTS.webhooks;
const COLLECTION = "webhooks";

/** The fixture a remote webhook reads as from one env: its url under that env alone. */
const fixtureRowOf = ({
	webhook,
	envKey,
}: {
	webhook: RemoteWebhook;
	envKey: string;
}): Record<string, unknown> => ({
	id: webhook.id,
	url: { [envKey]: webhook.url },
	events: webhook.events,
	...(webhook.description ? { description: webhook.description } : {}),
	...(webhook.disabled ? { disabled: true } : {}),
});

/** Rule 1: a remote webhook the config never names is appended for this env. */
export const appendWebhook = ({
	pull,
	webhook,
	envKey,
}: {
	pull: PullFiles;
	webhook: RemoteWebhook;
	envKey: string;
}): string | null => {
	const { configPath, files } = pull;
	const configSource = files.get(configPath) ?? "";
	const withKey = insertCollection({
		source: configSource,
		collection: COLLECTION,
	});
	if (withKey === null)
		return "append to `webhooks` by hand: no atmn({...}) call";
	// A spread may already hold `webhooks`; a second key after it would override it.
	const spreads = rootSpreadNames({ source: configSource });
	if (withKey !== configSource && spreads.length > 0)
		return `append to \`webhooks\` by hand: atmn() spreads \`${spreads.join("`, `")}\`, which may already hold it`;
	files.set(configPath, withKey);
	const target = resolveCollectionTarget({
		configPath,
		files,
		collection: COLLECTION,
	});
	if (target === null)
		return "append to `webhooks` by hand: it is not an array literal";
	const text = (indent: string) =>
		emitFixture({
			spec: SPEC,
			row: fixtureRowOf({ webhook, envKey }),
			includeMappings: false,
			indent,
		});
	const source = files.get(target.file) ?? "";
	const updated =
		target.kind === "inline"
			? appendToCollection({ source, collection: COLLECTION, text })
			: appendToBinding({ source, name: target.name, text });
	if (updated === null)
		return "append to `webhooks` by hand: it is not an array literal";
	files.set(
		target.file,
		ensureBuilderImport({
			source: updated,
			builder: SPEC.builder,
			collection: COLLECTION,
		}),
	);
	return null;
};
