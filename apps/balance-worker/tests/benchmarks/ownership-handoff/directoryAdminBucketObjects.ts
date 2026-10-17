import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	type Dirent,
	linkSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type {
	AdminBucketObjects,
	AdminObject,
	AdminObjectListing,
} from "../../../src/external/s3/types/adminBucketObjects.js";

const LOCK_STALE_MS = 5_000;
const LOCK_WAIT_MS = 2_000;
const LOCK_RETRY_MS = 5;
const SCRATCH = ".scratch";
const LOCK_SUFFIX = ".lock";

export function createDirectoryAdminBucketObjects({
	directory,
}: {
	directory: string;
}): AdminBucketObjects {
	function pathOf(key: string): string {
		return join(directory, key);
	}

	function etagOf(text: string): string {
		return createHash("sha256").update(text).digest("hex");
	}

	function isMissing(cause: unknown): boolean {
		return (cause as NodeJS.ErrnoException).code === "ENOENT";
	}

	function readText(path: string): string | null {
		try {
			return readFileSync(path, "utf8");
		} catch (cause) {
			if (isMissing(cause)) return null;
			throw cause;
		}
	}

	function writeScratch({
		path,
		body,
	}: {
		path: string;
		body: string;
	}): string {
		mkdirSync(dirname(path), { recursive: true });
		const scratch = join(directory, SCRATCH);
		mkdirSync(scratch, { recursive: true });
		const temporary = join(scratch, `${process.pid}-${randomUUID()}`);
		writeFileSync(temporary, body);
		return temporary;
	}

	function filesUnder(root: string): string[] {
		let entries: Dirent[];
		try {
			entries = readdirSync(root, { withFileTypes: true });
		} catch (cause) {
			if (isMissing(cause)) return [];
			throw cause;
		}
		const files: string[] = [];
		for (const entry of entries) {
			const path = join(root, entry.name);
			if (entry.isDirectory()) files.push(...filesUnder(path));
			else if (!entry.name.endsWith(LOCK_SUFFIX)) files.push(path);
		}
		return files;
	}

	async function withLock<Value>({
		path,
		run,
	}: {
		path: string;
		run: () => Value;
	}): Promise<Value> {
		const lock = `${path}${LOCK_SUFFIX}`;
		mkdirSync(dirname(lock), { recursive: true });
		const deadline = Date.now() + LOCK_WAIT_MS;
		for (;;) {
			try {
				closeSync(openSync(lock, "wx"));
				break;
			} catch (cause) {
				if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
				if (isStaleLock(lock)) continue;
				if (Date.now() > deadline)
					throw new Error(`Admin object lock busy: ${path}`);
				await Bun.sleep(LOCK_RETRY_MS);
			}
		}
		try {
			return run();
		} finally {
			unlinkSync(lock);
		}
	}

	function isStaleLock(lock: string): boolean {
		try {
			if (Date.now() - statSync(lock).mtimeMs < LOCK_STALE_MS) return false;
			unlinkSync(lock);
			return true;
		} catch (cause) {
			if (isMissing(cause)) return true;
			throw cause;
		}
	}

	async function list({
		prefix,
	}: {
		prefix: string;
	}): Promise<AdminObjectListing[]> {
		const root = pathOf(prefix.slice(0, prefix.lastIndexOf("/") + 1));
		const listed: AdminObjectListing[] = [];
		for (const path of filesUnder(root)) {
			const key = relative(directory, path);
			if (!key.startsWith(prefix)) continue;
			const text = readText(path);
			if (text !== null) listed.push({ key, etag: etagOf(text) });
		}
		return listed;
	}

	async function read({ key }: { key: string }): Promise<AdminObject | null> {
		const text = readText(pathOf(key));
		if (text === null) return null;
		return { text, etag: etagOf(text) };
	}

	async function create({
		key,
		body,
	}: {
		key: string;
		body: string;
	}): Promise<boolean> {
		const path = pathOf(key);
		const temporary = writeScratch({ path, body });
		try {
			linkSync(temporary, path);
			return true;
		} catch (cause) {
			if ((cause as NodeJS.ErrnoException).code === "EEXIST") return false;
			throw cause;
		} finally {
			unlinkSync(temporary);
		}
	}

	async function replace({
		key,
		body,
		etag,
	}: {
		key: string;
		body: string;
		etag: string;
	}): Promise<boolean> {
		const path = pathOf(key);
		return withLock({
			path,
			run: () => {
				const current = readText(path);
				if (current === null || etagOf(current) !== etag) return false;
				renameSync(writeScratch({ path, body }), path);
				return true;
			},
		});
	}

	async function remove({ key }: { key: string }): Promise<void> {
		const path = pathOf(key);
		await withLock({
			path,
			run: () => {
				try {
					unlinkSync(path);
				} catch (cause) {
					if (!isMissing(cause)) throw cause;
				}
			},
		});
	}

	return { list, read, create, replace, remove };
}
