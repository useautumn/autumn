import { createContext, useContext } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";

type AtomApi = { basePath: string; queryKey: readonly unknown[] };

const AtomApiContext = createContext<AtomApi | null>(null);

export const AtomApiProvider = AtomApiContext.Provider;

export const useAtomApi = (): AtomApi => {
	const atomApi = useContext(AtomApiContext);
	const buildKey = useQueryKeyFactory();
	return atomApi ?? { basePath: "/v1", queryKey: buildKey(["atom"]) };
};
