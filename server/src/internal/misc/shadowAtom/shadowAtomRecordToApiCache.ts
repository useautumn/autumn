import { type ApiByocCache, AppEnv } from "@autumn/shared";
import {
	shadowAtomRecordId,
	shadowAtomRecordNames,
} from "./shadowAtomNames.js";
import type { ShadowAtomRecord } from "./types/shadowAtomRecord.js";

/** A shadow Atom as an org's Atom page reads it. It serves both envs, so it reports live; it has no first check. */
export const shadowAtomRecordToApiCache = ({
	record,
}: {
	record: ShadowAtomRecord;
}): ApiByocCache => ({
	id: shadowAtomRecordId({ record }),
	env: AppEnv.Live,
	name: null,
	stack_name: shadowAtomRecordNames({ record }).label,
	status: record.status,
	deployment_id: record.deployment_id,
	endpoint_url: record.endpoint_url,
	created_at: record.created_at,
	first_check_at: null,
	cpu: record.cpu,
	memory: record.memory,
	region: record.region,
	network: record.network,
	stages: record.stages,
	error: record.error,
});
