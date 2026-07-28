import { sql } from "drizzle-orm";
import { logger } from "../../external/logtail/logtailUtils.js";
import type { DbProbe } from "./types.js";

type SlotRow = {
	in_recovery: boolean | null;
	slot_name: string | null;
	slot_type: string | null;
	active: boolean | null;
	failover: boolean | null;
	wal_status: string | null;
	confirmed_flush_lsn: string | null;
	retained_wal_bytes: string | number | null;
};

const toBytes = (value: string | number | null): number | null => {
	if (value === null) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

export const replicationSlotProbe: DbProbe = {
	name: "db_replication_slots",
	run: async ({ db }) => {
		// LEFT JOIN so a primary with zero slots still returns a row: "the slots
		// vanished" and "we never reached the server" must not look identical.
		const rows = await db.execute<SlotRow>(sql`
			SELECT
				recovery.in_recovery,
				slots.slot_name,
				slots.slot_type,
				slots.active,
				-- Read through jsonb: failover only exists on PG 17+, and naming it
				-- directly would fail parsing and cost us every other slot field.
				(to_jsonb(slots) ->> 'failover')::boolean AS failover,
				slots.wal_status,
				slots.confirmed_flush_lsn::text AS confirmed_flush_lsn,
				CASE
					WHEN recovery.in_recovery OR slots.restart_lsn IS NULL THEN NULL
					ELSE (pg_current_wal_lsn() - slots.restart_lsn)::bigint
				END AS retained_wal_bytes
			FROM (SELECT pg_is_in_recovery() AS in_recovery) AS recovery
			LEFT JOIN pg_replication_slots AS slots ON true
			ORDER BY slots.slot_name ASC
		`);

		const inRecovery = rows[0]?.in_recovery ?? null;
		const blind = rows.length === 0 || inRecovery !== false;
		const slots = rows.filter((row) => row.slot_name !== null);

		if (blind) {
			logger.warn(
				{ type: "db_replication_slots_blind", in_recovery: inRecovery },
				"Replication slot probe is not reading a primary",
			);
		} else if (slots.length === 0) {
			logger.warn(
				{ type: "db_replication_slots_empty" },
				"Primary reports zero replication slots",
			);
		}

		logger.info(
			{
				type: "db_replication_slots",
				blind,
				in_recovery: inRecovery,
				slot_count: slots.length,
				slot_names: slots.map((slot) => slot.slot_name).join(","),
			},
			"DB replication slot probe",
		);

		for (const slot of slots) {
			logger.info(
				{
					type: "db_replication_slot",
					blind,
					slot_name: slot.slot_name,
					slot_type: slot.slot_type,
					active: slot.active,
					failover: slot.failover,
					wal_status: slot.wal_status,
					confirmed_flush_lsn: slot.confirmed_flush_lsn,
					retained_wal_bytes: toBytes(slot.retained_wal_bytes),
				},
				"DB replication slot",
			);
		}
	},
};
