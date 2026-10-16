import { createContext, type ReactNode, useContext } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";

/** Where the Atom hooks send their `byoc.*` calls, the query key their data sits under, and which of the env's Atoms they mean. */
type AtomApi = {
	basePath: string;
	queryKey: readonly unknown[];
	/** Omitted, the env's only Atom (or the shadow Atom staff run). */
	atomId?: string;
	/** Called once a new Atom is created, so the page can open it. */
	onCreated?: (atomId: string) => void;
};

const AtomApiContext = createContext<AtomApi | null>(null);

/** Points every Atom hook beneath it at another Atom, such as the shadow Atom staff run. */
export const AtomApiProvider = AtomApiContext.Provider;

/** The org's own Atom unless a provider above says otherwise. */
export const useAtomApi = (): AtomApi => {
	const atomApi = useContext(AtomApiContext);
	const buildKey = useQueryKeyFactory();
	return atomApi ?? { basePath: "/v1", queryKey: buildKey(["atom"]) };
};

/** The `atom_id` a call names, when the hooks mean one of several Atoms. */
export const atomIdBody = ({ atomId }: Pick<AtomApi, "atomId">) =>
	atomId ? { atom_id: atomId } : {};

/** Scopes the Atom hooks beneath it to one of the env's Atoms, or to a new one when `atomId` is omitted. */
export const AtomScope = ({
	atomId,
	onCreated,
	children,
}: {
	atomId?: string;
	onCreated?: (atomId: string) => void;
	children: ReactNode;
}) => {
	const { basePath, queryKey } = useAtomApi();
	return (
		<AtomApiProvider
			value={{
				basePath,
				queryKey: [...queryKey, atomId ?? "new"],
				atomId,
				onCreated,
			}}
		>
			{children}
		</AtomApiProvider>
	);
};
