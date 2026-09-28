import { SYNCED_LISTS } from "../../../generated/emit";
import { type LocatedFixture, locateFixture } from "../locateFixture";
import type { PullFiles } from "./types";

const SPEC = SYNCED_LISTS.webhooks;

/** A `webhook({...})` call with this id, even when some values are code. */
export const locateWebhook = ({
	pull,
	id,
}: {
	pull: PullFiles;
	id: string;
}): LocatedFixture | null =>
	locateFixture({
		configPath: pull.configPath,
		files: pull.files,
		builder: SPEC.builder,
		idField: SPEC.idField,
		id,
		allowDynamic: true,
	});
