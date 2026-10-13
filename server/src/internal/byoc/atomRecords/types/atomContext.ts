import type { AtomDeployer } from "../../deployers/types/atomDeployer.js";
import type { AtomRecord } from "./atomRecord.js";
import type { AtomStorage } from "./atomStorage.js";

/** One Atom as the shared lifecycle drives it: who runs it, and where its record is kept. */
export type AtomContext<T extends AtomRecord> = {
	deployer: AtomDeployer;
	storage: AtomStorage<T>;
};
