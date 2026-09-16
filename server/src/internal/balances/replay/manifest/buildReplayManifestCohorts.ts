import {
	REPLAY_BODY_FEATURE_ID_FIELD,
	type ReplayManifest,
	type ReplayManifestCohort,
	type ReplayManifestCohortIdentity,
	type ReplayManifestRequest,
} from "./replayManifestContracts.js";

type ReplayManifestCohortDraft = {
	identity: ReplayManifestCohortIdentity;
	featureIds: Set<string>;
	requests: ReplayManifestRequest[];
};

const buildCohortIdentity = ({
	request,
}: {
	request: ReplayManifestRequest;
}): ReplayManifestCohortIdentity =>
	Object.freeze({
		orgId: request.orgId,
		env: request.env,
		customerId: request.customerId,
	});

const buildCohortKey = ({
	identity,
}: {
	identity: ReplayManifestCohortIdentity;
}): string =>
	JSON.stringify([identity.orgId, identity.env, identity.customerId]);

const resolveConcreteFeatureId = ({
	request,
}: {
	request: ReplayManifestRequest;
}): string | null => {
	const featureId = request.body[REPLAY_BODY_FEATURE_ID_FIELD];
	if (typeof featureId !== "string" || featureId.trim().length === 0) {
		return null;
	}
	return featureId;
};

const ensureCohortDraft = ({
	drafts,
	request,
}: {
	drafts: Map<string, ReplayManifestCohortDraft>;
	request: ReplayManifestRequest;
}): ReplayManifestCohortDraft => {
	const identity = buildCohortIdentity({ request });
	const cohortKey = buildCohortKey({ identity });
	const existingDraft = drafts.get(cohortKey);
	if (existingDraft !== undefined) {
		return existingDraft;
	}
	const draft: ReplayManifestCohortDraft = {
		identity,
		featureIds: new Set<string>(),
		requests: [],
	};
	drafts.set(cohortKey, draft);
	return draft;
};

const collectRequestIntoDraft = ({
	draft,
	request,
}: {
	draft: ReplayManifestCohortDraft;
	request: ReplayManifestRequest;
}): void => {
	draft.requests.push(request);
	const featureId = resolveConcreteFeatureId({ request });
	if (featureId !== null) {
		draft.featureIds.add(featureId);
	}
};

const finalizeCohort = ({
	draft,
}: {
	draft: ReplayManifestCohortDraft;
}): ReplayManifestCohort =>
	Object.freeze({
		identity: draft.identity,
		featureIds: Object.freeze([...draft.featureIds].sort()),
		requestCount: draft.requests.length,
		requests: Object.freeze([...draft.requests]),
	});

export const buildReplayManifestCohorts = ({
	manifest,
}: {
	manifest: ReplayManifest;
}): readonly ReplayManifestCohort[] => {
	const drafts = new Map<string, ReplayManifestCohortDraft>();
	for (const request of manifest.requests) {
		const draft = ensureCohortDraft({ drafts, request });
		collectRequestIntoDraft({ draft, request });
	}
	const cohorts: ReplayManifestCohort[] = [];
	for (const draft of drafts.values()) {
		cohorts.push(finalizeCohort({ draft }));
	}
	return Object.freeze(cohorts);
};
