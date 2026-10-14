type TtlCacheEntry<T> = {
	expiresAt: number;
	value: Promise<T>;
};

export const createTtlCache = <T>({
	onEvict,
	sliding = false,
	ttlMs,
}: {
	onEvict?: (value: Promise<T>) => void;
	sliding?: boolean;
	ttlMs: number;
}) => {
	const entries = new Map<string, TtlCacheEntry<T>>();

	const evict = (key: string, entry: TtlCacheEntry<T>) => {
		entries.delete(key);
		onEvict?.(entry.value);
	};

	const sweep = () => {
		const now = Date.now();
		for (const [key, entry] of entries) {
			if (entry.expiresAt <= now) evict(key, entry);
		}
	};

	return {
		delete: (key: string) => {
			const entry = entries.get(key);
			if (!entry) return;
			evict(key, entry);
		},
		getOrCreate: (key: string, load: () => Promise<T>): Promise<T> => {
			sweep();
			const cached = entries.get(key);
			if (cached && cached.expiresAt > Date.now()) {
				if (sliding) cached.expiresAt = Date.now() + ttlMs;
				return cached.value;
			}
			const entry: TtlCacheEntry<T> = {
				expiresAt: Date.now() + ttlMs,
				value: load(),
			};
			entries.set(key, entry);
			entry.value.catch(() => {
				if (entries.get(key) === entry) evict(key, entry);
			});
			return entry.value;
		},
	};
};
