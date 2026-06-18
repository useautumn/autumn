import { Link } from "react-router";
import ErrorScreen from "./general/ErrorScreen";

export const DefaultView = () => {
	return (
		<ErrorScreen>
			<p className="mb-4">🚩 This page is not found</p>
			<Link className="text-tertiary-foreground hover:underline" to="/customers">
				Return to dashboard
			</Link>
		</ErrorScreen>
	);
};
