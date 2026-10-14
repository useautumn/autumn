import type {
	AppliedSubject,
	SubjectCursor,
} from "../../state/repos/subjectStates.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";
import type { CatalogRows, SubjectSource } from "../types/slots.js";
import type { ReplicaSlotsContext } from "./types/replicaSlotsContext.js";

const CATCH_UP_PAGE = 500;
const FETCH_BATCH = 100;

type Version = { readAt: number; logOffset: bigint };

const isNewer = (a: Version, b: Version) =>
	a.readAt > b.readAt || (a.readAt === b.readAt && a.logOffset > b.logOffset);

const writeNewer = ({
	store,
	page,
}: {
	store: SqliteStore;
	page: AppliedSubject[];
}): number => {
	const subjects = page
		.map(({ subject }) => subject)
		.filter((subject) => {
			const { customerId, entityId } = subject.state.identity;
			const held = store.readVersion({
				customerId,
				entityId: entityId ?? null,
			});
			return !held || isNewer(subject, held);
		});
	if (subjects.length === 0) return 0;
	return store.setSubjects({ subjects }).filter(Boolean).length;
};

type SlotCopy = {
	store: SqliteStore;
	source: SubjectSource;
	slot: number;
	slotCount: number;
};

const copyRows = async ({
	store,
	source,
	slot,
	slotCount,
	window,
}: SlotCopy & { window: number | null }): Promise<number> => {
	let written = 0;
	let after: number | null = null;
	let cursor: SubjectCursor | null = null;
	let first = true;
	for (;;) {
		const page = await source.since({
			slot,
			slotCount,
			after: first ? null : after,
			window: first ? window : null,
			cursor,
			limit: CATCH_UP_PAGE,
		});
		first = false;
		after = page.after;
		written += writeNewer({ store, page: page.subjects });
		const last = page.subjects.at(-1);
		if (!last || page.subjects.length < CATCH_UP_PAGE) break;
		cursor = {
			appliedAt: last.appliedAt,
			customerId: last.subject.state.identity.customerId,
			entityId: last.subject.state.identity.entityId ?? "",
		};
	}
	return written;
};

const copyNewerRows = async ({
	store,
	source,
	slot,
	slotCount,
	window,
}: SlotCopy & { window: number }): Promise<number> => {
	let written = 0;
	let after: number | null = null;
	let cursor: SubjectCursor | null = null;
	let first = true;
	for (;;) {
		const page = await source.digest({
			slot,
			slotCount,
			after: first ? null : after,
			window: first ? window : null,
			cursor,
			limit: CATCH_UP_PAGE,
		});
		first = false;
		after = page.after;
		const wanted = page.digests.filter((digest) => {
			const held = store.readVersion({
				customerId: digest.customerId,
				entityId: digest.entityId || null,
			});
			return !held || isNewer(digest, held);
		});
		for (let i = 0; i < wanted.length; i += FETCH_BATCH) {
			const keys = wanted
				.slice(i, i + FETCH_BATCH)
				.map(({ customerId, entityId }) => ({ customerId, entityId }));
			written += writeNewer({
				store,
				page: await source.fetch({ slot, slotCount, keys }),
			});
		}
		const last = page.digests.at(-1);
		if (!last || page.digests.length < CATCH_UP_PAGE) break;
		cursor = {
			appliedAt: last.appliedAt,
			customerId: last.customerId,
			entityId: last.entityId,
		};
	}
	return written;
};

export const catchUp = async ({
	ctx,
	source,
	window,
	setCatalog,
}: {
	ctx: ReplicaSlotsContext;
	source: SubjectSource;
	window: number | null;
	setCatalog: (params: CatalogRows) => Promise<boolean>;
}): Promise<{ slots: number; written: number }> => {
	const catalog = await source.catalog({
		readAtAfter: ctx.catalogStore.read()?.readAt ?? -1,
	});
	if (catalog) await setCatalog(catalog);
	let written = 0;
	let synced = 0;
	for (const [slot, { sqliteStore: store }] of ctx.slots.entries()) {
		if (!store) continue;
		const copy = { store, source, slot, slotCount: ctx.slotCount };
		written +=
			window === null
				? await copyRows({ ...copy, window })
				: await copyNewerRows({ ...copy, window });
		synced += 1;
	}
	return { slots: synced, written };
};
