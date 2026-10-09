import { type ApiByocCache, AppEnv } from "@autumn/shared";
import { shadowAtomCacheNames } from "@/internal/byoc/utils/byocCacheUtils.js";
import type { ShadowAtomRecord } from "./types/shadowAtomRecord.js";

/** The shadow Atom as an org's Atom page reads it. It serves both envs, so it reports live; it has no network choice or first check. */
export const shadowAtomRecordToApiCache = ({
	record,
}: {
	record: ShadowAtomRecord;
}): ApiByocCache => {
	const { externalId, label } = shadowAtomCacheNames();
	return {
		id: externalId,
		env: AppEnv.Live,
		stack_name: label,
		status: record.status,
		deployment_id: record.deployment_id,
		endpoint_url: record.endpoint_url,
		created_at: record.created_at,
		first_check_at: null,
		cpu: record.cpu,
		memory: record.memory,
		region: record.region,
		network: null,
		stages: record.stages,
		error: record.error,
	};
};
