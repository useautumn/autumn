import { useLocation, useNavigate } from "react-router";

export const useSetSearchParams = () => {
	const navigate = useNavigate();
	const location = useLocation();

	return (params: any) => {
		const searchParams = new URLSearchParams(location.search);
		for (const [key, value] of Object.entries(params)) {
			searchParams.set(key, value as string);
		}
		navigate(`${location.pathname}?${searchParams.toString()}`);
	};
};
