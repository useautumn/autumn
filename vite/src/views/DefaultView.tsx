import { Link } from "react-router";
import { useEnv } from "@/utils/envUtils";
import { getRedirectUrl } from "@/utils/genUtils";
import ErrorScreen from "./general/ErrorScreen";

export const DefaultView = () => {
	const env = useEnv();
	return (
		<ErrorScreen>
			<p className="mb-4">🚩 This page is not found</p>
			<Link
				className="text-tertiary-foreground hover:underline"
				to={getRedirectUrl("/customers", env)}
			>
				Return to dashboard
			</Link>
		</ErrorScreen>
	);
};
