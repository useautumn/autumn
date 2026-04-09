import { Link, Navigate, useLocation, useParams } from "react-router";
import ErrorScreen from "./general/ErrorScreen";

export const DefaultView = () => {
	const { pathname } = useLocation();
	const { org_id, env } = useParams();

	// If we're at the org/env root with no page, redirect to customers
	const parts = pathname.split("/").filter(Boolean);
	// parts: [org_id, env] or [org_id, env, ""]
	if (parts.length <= 2 || (parts.length === 3 && parts[2] === "")) {
		return <Navigate to={`/${org_id}/${env}/customers`} replace={true} />;
	}

	return (
		<ErrorScreen>
			<p className="mb-4">🚩 This page is not found</p>
			<Link
				className="text-t3 hover:underline"
				to={`/${org_id}/${env}/customers`}
			>
				Return to dashboard
			</Link>
		</ErrorScreen>
	);
};
