import type { AtomDeployer } from "../../deployers/types/atomDeployer.js";
import type { AtomRecord } from "./atomRecord.js";
import type { AtomStorage } from "./atomStorage.js";

export type AtomContext<T extends AtomRecord> = {
	deployer: AtomDeployer;
	storage: AtomStorage<T>;
};
