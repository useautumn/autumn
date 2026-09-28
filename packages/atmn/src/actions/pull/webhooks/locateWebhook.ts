import { SYNCED_LISTS } from "../../../generated/emit";
import { type LocatedFixture, locateFixture } from "../locateFixture";
import type { PullFiles } from "./types";

const SPEC = SYNCED_LISTS.webhooks;

/** The `webhook({...})` with this id in this env, even when some values are code. */
export const locateWebhook = ({
	pull,
	id,
	envKey,
}: {
	pull: PullFiles;
	id: string;
	envKey: string;
}): LocatedFixture | null =>
	locateFixture({
		configPath: pull.configPath,
		files: pull.files,
		builder: SPEC.builder,
		idField: SPEC.idField,
		id,
		where: webhookWhere({ envKey }),
		allowDynamic: true,
	});

/** Narrows a lookup of one id to the entry in this env. */
export const webhookWhere = ({ envKey }: { envKey: string }) => [
	{ field: SPEC.envField, equals: envKey },
];
