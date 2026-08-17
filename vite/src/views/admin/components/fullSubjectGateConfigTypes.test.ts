import { describe, expect, test } from "bun:test";
import {
	FULL_SUBJECT_GATE_DEFAULTS,
	type FullSubjectGateConfig,
	getFullSubjectGateFormValues,
} from "./fullSubjectGateConfigTypes";

describe("FullSubject gate admin config", () => {
	test("round-trips delayed Postgres backup read settings", () => {
		const config: FullSubjectGateConfig = {
			...FULL_SUBJECT_GATE_DEFAULTS,
			delayed_postgres_backup_read: {
				enabled: false,
				delay_ms: 750,
				max_in_flight_per_process: 4,
			},
			replica_lane: {
				per_customer_limit: 120,
				per_org_limit: 240,
				per_customer_pending_max: 360,
				per_org_pending_max: 480,
			},
			read_split: { replica_share: 0.25 },
			configHealthy: true,
		};

		expect(getFullSubjectGateFormValues({ config })).toEqual({
			...FULL_SUBJECT_GATE_DEFAULTS,
			delayed_postgres_backup_read: {
				enabled: false,
				delay_ms: 750,
				max_in_flight_per_process: 4,
			},
			replica_lane: {
				per_customer_limit: 120,
				per_org_limit: 240,
				per_customer_pending_max: 360,
				per_org_pending_max: 480,
			},
			read_split: { replica_share: 0.25 },
		});
	});
});
