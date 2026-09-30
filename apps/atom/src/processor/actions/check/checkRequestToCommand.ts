import type { CheckCommand } from "@autumn/balance-engine";
import type { StoredSubject } from "../../../state/types/storedSubject.js";
import type { CheckRequest } from "../../types/check.js";

/** The engine's check command: the request, plus the identity and org settings stored with the subject. Null when the subject's catalog does not hold the feature. */
export const checkRequestToCommand = ({
	request,
	subject,
}: {
	request: CheckRequest;
	subject: StoredSubject;
}): CheckCommand | null => {
	const feature = Object.values(subject.catalog.features).find(
		(catalogFeature) => catalogFeature.id === request.featureId,
	);
	if (!feature) return null;

	return {
		schemaVersion: 1,
		type: "check",
		requestId: request.requestId,
		identity: subject.state.identity,
		occurredAt: request.occurredAt,
		org: subject.org,
		featureId: request.featureId,
		internalFeatureId: feature.internal_id,
		requiredBalance: request.requiredBalance,
		properties: request.properties,
	};
};
