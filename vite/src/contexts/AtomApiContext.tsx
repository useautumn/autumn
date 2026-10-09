import { createContext, useContext } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";

/** Where the Atom hooks send their `byoc.*` calls, and the query key their data sits under. */
type AtomApi = { basePath: string; queryKey: readonly unknown[] };

const AtomApiContext = createContext<AtomApi | null>(null);

/** Points every Atom hook beneath it at another Atom, such as the shadow Atom staff run. */
export const AtomApiProvider = AtomApiContext.Provider;

/** The org's own Atom unless a provider above says otherwise. */
export const useAtomApi = (): AtomApi => {
	const atomApi = useContext(AtomApiContext);
	const buildKey = useQueryKeyFactory();
	return atomApi ?? { basePath: "/v1", queryKey: buildKey(["atom"]) };
};
