import {
	SubjectSnapshotsEdgeConfigSchema,
	stampSubjectSnapshotsWrittenAfter,
} from "@autumn/edge-config";
import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { subjectSnapshotsStore } from "@/internal/misc/subjectSnapshots/subjectSnapshotsStore.js";

export const handleUpsertAdminSubjectSnapshotsConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: SubjectSnapshotsEdgeConfigSchema,
	handler: async (c) => {
		// An unreadable record counts as off, so the save stamps writtenAfter rather than trusting old rows.
		const previous = await subjectSnapshotsStore
			.readFromSource()
			.catch(() => null);
		const config = stampSubjectSnapshotsWrittenAfter({
			previous,
			next: c.req.valid("json"),
			now: Date.now(),
		});
		await subjectSnapshotsStore.writeToSource({ config });
		return c.json({ success: true, config });
	},
});
