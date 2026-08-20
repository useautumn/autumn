import { LRUCache } from "lru-cache";
import type { CachedFullSubject } from "./fullSubjectCacheModel.js";

const STATIC_SUBJECT_L1_MAX_SIZE = 64 * 1024 * 1024;
const STATIC_SUBJECT_L1_MAX_ENTRIES = 1_000;
const STATIC_SUBJECT_L1_TTL_MS = 5 * 60 * 1_000;

type StaticSubjectL1Entry = {
	cached: CachedFullSubject;
	serializedSize: number;
};

const staticSubjectL1 = new LRUCache<string, StaticSubjectL1Entry>({
	max: STATIC_SUBJECT_L1_MAX_ENTRIES,
	maxSize: STATIC_SUBJECT_L1_MAX_SIZE,
	sizeCalculation: ({ serializedSize }) => Math.max(1, serializedSize * 2),
	ttl: STATIC_SUBJECT_L1_TTL_MS,
});

export const getCachedStaticSubject = ({
	subjectKey,
}: {
	subjectKey: string;
}): CachedFullSubject | undefined => staticSubjectL1.get(subjectKey)?.cached;

export const setCachedStaticSubject = ({
	subjectKey,
	cached,
	serializedSize,
}: {
	subjectKey: string;
	cached: CachedFullSubject;
	serializedSize: number;
}): void => {
	staticSubjectL1.set(subjectKey, { cached, serializedSize });
};

export const deleteCachedStaticSubject = ({
	subjectKey,
}: {
	subjectKey: string;
}): void => {
	staticSubjectL1.delete(subjectKey);
};

export const _resetCachedStaticSubjectL1ForTesting = (): void => {
	staticSubjectL1.clear();
};

export const _cachedStaticSubjectL1SizeForTesting = (): number =>
	staticSubjectL1.size;
