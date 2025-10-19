import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

interface UseClearQueryParamsProps {
	/** Query param keys to clear */
	queryParams: string[];
	/** Delay in milliseconds before clearing (default: 1000ms) */
	delay?: number;
}

/**
 * Automatically clears specified query params after a delay
 * Useful for cleaning up navigation-related params after page transitions
 */
export const useClearQueryParams = ({
	queryParams,
	delay = 1000,
}: UseClearQueryParamsProps) => {
	const [searchParams, setSearchParams] = useSearchParams();

	useEffect(() => {
		// Check if any of the specified params exist
		const hasParamsToClean = queryParams.some((param) =>
			searchParams.has(param),
		);

		if (hasParamsToClean) {
			const timeoutId = setTimeout(() => {
				const newParams = new URLSearchParams(searchParams);

				// Remove all specified params
				for (const param of queryParams) {
					newParams.delete(param);
				}

				setSearchParams(newParams, { replace: true });
			}, delay);

			return () => clearTimeout(timeoutId);
		}
	}, [searchParams, setSearchParams, queryParams, delay]);
};
