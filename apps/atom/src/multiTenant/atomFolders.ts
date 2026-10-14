import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { threadId } from "node:worker_threads";
import { z } from "zod/v4";

export type TenantAtom = { id: string; tokenHash: string };

const ATOM_FILE = "atom.json";
export const ATOM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const atomFileSchema = z.object({ token_hash: z.string().min(1) });

export const hasAtomFile = ({
	dataDir,
	id,
}: {
	dataDir: string;
	id: string;
}): boolean => existsSync(join(atomFolderPath({ dataDir, id }), ATOM_FILE));

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

export const listTenantAtoms = ({
	dataDir,
}: {
	dataDir: string;
}): TenantAtom[] => {
	mkdirSync(dataDir, { recursive: true });
	const tenantAtoms: TenantAtom[] = [];
	for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
		if (!entry.isDirectory() || !ATOM_ID.test(entry.name)) continue;
		const parsed = atomFileSchema.safeParse(
			readAtomFile({ atomFile: join(dataDir, entry.name, ATOM_FILE) }),
		);
		if (parsed.success)
			tenantAtoms.push({ id: entry.name, tokenHash: parsed.data.token_hash });
	}
	return tenantAtoms;
};

const readAtomFile = ({ atomFile }: { atomFile: string }): unknown => {
	try {
		return JSON.parse(readFileSync(atomFile, "utf8"));
	} catch {
		return null;
	}
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
	const staged = join(folder, `${ATOM_FILE}.${process.pid}.${threadId}.tmp`);
	writeFileSync(staged, JSON.stringify({ token_hash: tenantAtom.tokenHash }));
	renameSync(staged, join(folder, ATOM_FILE));
};

export const removeAtomFolder = ({
	dataDir,
	id,
}: {
	dataDir: string;
	id: string;
}): void => {
	rmSync(atomFolderPath({ dataDir, id }), {
		recursive: true,
		force: true,
		maxRetries: 3,
	});
};
