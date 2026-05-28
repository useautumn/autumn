const redisStore = new Map<string, string>();

class FakeMulti {
	private readonly ops: (() => void)[] = [];

	set(key: string, value: string) {
		this.ops.push(() => redisStore.set(key, value));
		return this;
	}

	async exec() {
		this.ops.forEach((op) => op());
		return [];
	}
}

class FakeRedis {
	on() {
		return this;
	}

	multi() {
		return new FakeMulti();
	}

	async get(key: string) {
		return redisStore.get(key) ?? null;
	}

	async del(...keys: string[]) {
		keys.forEach((key) => redisStore.delete(key));
	}

	async keys(pattern: string) {
		const prefix = pattern.replace(/\*$/, "");
		return [...redisStore.keys()].filter((key) => key.startsWith(prefix));
	}
}

export const createTestRedis = () => new FakeRedis();
