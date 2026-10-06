import { closeSync, ftruncateSync, openSync } from "node:fs";

/** Buckets per slot file: a slot holds a few hundred subjects, so two sharing a bucket is rare and only costs a re-read. */
const BUCKETS = 4096;

export type VersionStamps = {
	/** The bucket's current stamp; read before the row, so a write that lands after the read always changes it. */
	read(params: { key: string }): number;
	/** Called after a write commits: every process's next check of that bucket goes back to the file. */
	bump(params: { key: string }): void;
};

const bucketOf = (key: string): number => {
	let hash = 0x811c9dc5;
	for (let i = 0; i < key.length; i++)
		hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
	return (hash >>> 0) % BUCKETS;
};

const mapStamps = ({ path }: { path: string }): Float64Array => {
	const fd = openSync(path, "a+");
	try {
		// Growing is idempotent, so processes opening the file together agree on its size.
		ftruncateSync(fd, BUCKETS * Float64Array.BYTES_PER_ELEMENT);
	} finally {
		closeSync(fd);
	}
	const bytes = Bun.mmap(path);
	return new Float64Array(bytes.buffer, bytes.byteOffset, BUCKETS);
};

/**
 * One 8-byte stamp per bucket of subjects, in a file every process maps (in memory for a database held only in memory).
 * A writer stores a fresh random stamp after its commit, so a check that sees its copy's stamp knows the row is unchanged.
 */
export const openVersionStamps = ({
	path,
}: {
	path: string | null;
}): VersionStamps => {
	const stamps =
		path === null ? new Float64Array(BUCKETS) : mapStamps({ path });
	return {
		read: ({ key }) => stamps[bucketOf(key)] ?? 0,
		bump: ({ key }) => {
			stamps[bucketOf(key)] = Math.random() + 1;
		},
	};
};
