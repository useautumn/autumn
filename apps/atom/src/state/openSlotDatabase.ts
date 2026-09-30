import { Database } from "bun:sqlite";

export const SLOT_SCHEMA_VERSION = 1;

export class UnsupportedSlotSchemaVersionError extends Error {
	constructor({ version }: { version: bigint }) {
		super(
			`Slot file schema version ${version} is newer than this Atom supports`,
		);
		this.name = "UnsupportedSlotSchemaVersionError";
	}
}

const configureDatabase = ({ database }: { database: Database }) => {
	database.run("PRAGMA journal_mode = WAL");
	// Autumn holds the truth and can send a subject again, so a commit does not wait on the disk.
	database.run("PRAGMA synchronous = NORMAL");
};

const initializeSchema = ({ database }: { database: Database }) => {
	const version = database
		.query<{ userVersion: bigint }, []>(
			"SELECT user_version AS userVersion FROM pragma_user_version",
		)
		.get()?.userVersion;

	if (version === undefined) {
		throw new Error("Unable to read SQLite schema version");
	}
	if (version > BigInt(SLOT_SCHEMA_VERSION)) {
		throw new UnsupportedSlotSchemaVersionError({ version });
	}

	const migrate = database.transaction(() => {
		// entity_id is '' for the customer's own rows, so the pair is always a full key.
		database.run(`
			CREATE TABLE IF NOT EXISTS subject_states (
				customer_id TEXT NOT NULL,
				entity_id TEXT NOT NULL,
				log_offset INTEGER NOT NULL CHECK (log_offset >= 0),
				state_json TEXT NOT NULL,
				catalog_json TEXT NOT NULL,
				org_json TEXT NOT NULL,
				PRIMARY KEY (customer_id, entity_id)
			) WITHOUT ROWID
		`);
		database.run(`PRAGMA user_version = ${SLOT_SCHEMA_VERSION}`);
	});

	migrate.exclusive();
};

/** A slot is one SQLite file holding the subjects whose customer hashes to it. */
export const openSlotDatabase = ({
	databasePath,
}: {
	databasePath: string;
}): Database => {
	const database = new Database(databasePath, {
		create: true,
		readwrite: true,
		safeIntegers: true,
		strict: true,
	});

	try {
		configureDatabase({ database });
		initializeSchema({ database });
		return database;
	} catch (error) {
		database.close();
		throw error;
	}
};
