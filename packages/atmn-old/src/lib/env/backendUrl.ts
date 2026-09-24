import { BACKEND_URL, LOCAL_BACKEND_URL } from "../../constants.js";
import { isLocal } from "./cliContext.js";

export const getBackendUrl = () =>
	process.env.ATMN_BACKEND_URL ?? (isLocal() ? LOCAL_BACKEND_URL : BACKEND_URL);
