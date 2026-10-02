import type { Feature } from "@autumn/shared";
import { instanceConfigsMatch } from "./instanceConfigsMatch";
import type { InstanceConfig } from "./types/instanceConfig";

type InternedConfig = { hash: string; config: InstanceConfig };

const configHash = ({
	features,
	interned,
	config,
}: {
	features: Feature[];
	interned: InternedConfig[];
	config: InstanceConfig;
}) => {
	const match = interned.find((candidate) =>
		instanceConfigsMatch({ features, first: candidate.config, second: config }),
	);
	if (match) return match.hash;

	const hash = `${config.fullProduct.id}:${interned.length}`;
	interned.push({ hash, config });
	return hash;
};

/** Gives equal configs one hash, so the diff compares strings rather than plans. */
export const createConfigInterner = ({ features }: { features: Feature[] }) => {
	const interned: InternedConfig[] = [];
	return {
		configHash: (config: InstanceConfig) =>
			configHash({ features, interned, config }),
	};
};

export type ConfigInterner = ReturnType<typeof createConfigInterner>;
