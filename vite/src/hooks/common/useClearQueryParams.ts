import { useEffect } from "react";
import { useSearchParams } from "react-router";

interface UseClearQueryParamsProps {
	queryParams: string[];
	delay?: number;
}

export const useClearQueryParams = ({
	queryParams,
	delay = 1000,
}: UseClearQueryParamsProps) => {
	const [searchParams, setSearchParams] = useSearchParams();

	useEffect(() => {
		const hasParamsToClean = queryParams.some((param) =>
			searchParams.has(param),
		);

		if (hasParamsToClean) {
			const timeoutId = setTimeout(() => {
				const newParams = new URLSearchParams(searchParams);

				for (const param of queryParams) {
					newParams.delete(param);
				}

				setSearchParams(newParams, { replace: true });
			}, delay);

			return () => clearTimeout(timeoutId);
		}
	}, [searchParams, setSearchParams, queryParams, delay]);
};
