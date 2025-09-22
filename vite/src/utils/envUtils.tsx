import { useLocation } from "react-router";
import { getEnvFromPath } from "./genUtils";

export const useEnv = () => {
	const { pathname } = useLocation();
	return getEnvFromPath(pathname);
};
