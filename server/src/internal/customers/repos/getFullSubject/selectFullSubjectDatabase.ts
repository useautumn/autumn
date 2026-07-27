import { context, trace } from "@opentelemetry/api";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { FullSubjectDatabaseTarget } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigSchemas.js";

type FullSubjectDatabaseFallbackReason = "replica_not_configured";

export type FullSubjectDatabaseSelection = {
	database: DrizzleCli;
	configuredTarget: FullSubjectDatabaseTarget;
	actualTarget: FullSubjectDatabaseTarget;
	fallbackReason: FullSubjectDatabaseFallbackReason | null;
};

export const selectFullSubjectDatabase = ({
	ctx,
	configuredTarget,
	replicaDatabase,
}: {
	ctx: AutumnContext;
	configuredTarget: FullSubjectDatabaseTarget;
	replicaDatabase: DrizzleCli | null;
}): FullSubjectDatabaseSelection => {
	const useReplica = configuredTarget === "replica" && replicaDatabase !== null;
	const fallbackReason =
		configuredTarget === "replica" && replicaDatabase === null
			? "replica_not_configured"
			: null;
	const selection: FullSubjectDatabaseSelection = {
		database: useReplica ? replicaDatabase : ctx.db,
		configuredTarget,
		actualTarget: useReplica ? "replica" : "primary",
		fallbackReason,
	};

	ctx.extraLogs.fullSubjectDatabase = {
		configuredTarget: selection.configuredTarget,
		actualTarget: selection.actualTarget,
		fallbackReason: selection.fallbackReason,
	};

	const activeSpan = trace.getSpan(context.active());
	activeSpan?.setAttribute(
		"full_subject.database_configured_target",
		selection.configuredTarget,
	);
	activeSpan?.setAttribute(
		"full_subject.database_target",
		selection.actualTarget,
	);
	if (selection.fallbackReason) {
		activeSpan?.setAttribute(
			"full_subject.database_fallback_reason",
			selection.fallbackReason,
		);
	}

	return selection;
};
