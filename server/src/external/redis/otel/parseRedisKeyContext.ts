export type RedisCacheGeneration = "v1" | "v2";

export type RedisKeyContext = {
	orgId?: string;
	customerId?: string;
	entityId?: string;
	generation?: RedisCacheGeneration;
};

const stripHashTag = (segment: string): string => {
	if (segment.startsWith("{") && segment.endsWith("}")) {
		return segment.slice(1, -1);
	}
	return segment;
};

export const parseRedisKeyContext = ({
	key,
}: {
	key?: string;
}): RedisKeyContext => {
	if (!key) return {};

	try {
		const parts = key.split(":");
		if (parts.length < 3) return {};

		const first = parts[0];

		if (
			first.startsWith("{") &&
			first.endsWith("}") &&
			parts.includes("full_subject")
		) {
			const customerId = stripHashTag(first);
			const orgId = parts[1];
			const entityId =
				parts[3] === "entity" && parts[4] && parts[5] === "full_subject"
					? parts[4]
					: undefined;
			return { customerId, orgId, entityId, generation: "v2" };
		}

		if (first.startsWith("{") && first.endsWith("}")) {
			const orgId = stripHashTag(first);
			const kind = parts[2];

			if (kind === "fullcustomer") {
				const customerId = parts[4];
				return { orgId, customerId, generation: "v1" };
			}

			if (kind === "customer") {
				const customerId = parts[4];
				let entityId: string | undefined;
				const entityIdx = parts.indexOf("entity", 5);
				if (entityIdx !== -1 && parts[entityIdx + 1]) {
					entityId = parts[entityIdx + 1];
				}
				return { orgId, customerId, entityId, generation: "v1" };
			}

			if (kind === "customer_guard" || kind === "test_cache_delete_guard") {
				return { orgId, customerId: parts[3], generation: "v1" };
			}

			return { orgId, generation: "v1" };
		}

		return {};
	} catch {
		return {};
	}
};
