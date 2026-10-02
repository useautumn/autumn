import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod/v4";

/** What the admin registers on a multi-tenant Atom: an id for the folder, and the hash of the token that opens it. */
export type TenantAtom = { id: string; tokenHash: string };

const ATOM_FILE = "atom.json";
/** One path segment, so an id can never name a folder outside the data directory. */
export const ATOM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const atomFileSchema = z.object({ token_hash: z.string().min(1) });

export const atomFolderPath = ({
	dataDir,
	id,
}: {
	dataDir: string;
	id: string;
}): string => {
	if (!ATOM_ID.test(id)) throw new Error(`Invalid Atom id: ${id}`);
	return join(dataDir, id);
};

/** Every folder under the data directory that records an Atom; anything else there is left alone. */
export const listTenantAtoms = ({
	dataDir,
}: {
	dataDir: string;
}): TenantAtom[] => {
	mkdirSync(dataDir, { recursive: true });
	const tenantAtoms: TenantAtom[] = [];
	for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
		const atomFile = join(dataDir, entry.name, ATOM_FILE);
		if (!entry.isDirectory() || !ATOM_ID.test(entry.name)) continue;
		if (!existsSync(atomFile)) continue;
		const parsed = atomFileSchema.safeParse(
			JSON.parse(readFileSync(atomFile, "utf8")),
		);
		if (parsed.success)
			tenantAtoms.push({ id: entry.name, tokenHash: parsed.data.token_hash });
	}
	return tenantAtoms;
};

export const writeTenantAtom = ({
	dataDir,
	tenantAtom,
}: {
	dataDir: string;
	tenantAtom: TenantAtom;
}): void => {
	const folder = atomFolderPath({ dataDir, id: tenantAtom.id });
	mkdirSync(folder, { recursive: true });
	writeFileSync(
		join(folder, ATOM_FILE),
		JSON.stringify({ token_hash: tenantAtom.tokenHash }),
	);
};

export const removeAtomFolder = ({
	dataDir,
	id,
}: {
	dataDir: string;
	id: string;
}): void => {
	rmSync(atomFolderPath({ dataDir, id }), { recursive: true, force: true });
};
