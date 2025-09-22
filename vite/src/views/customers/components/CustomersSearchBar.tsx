import SmallSpinner from "@/components/general/SmallSpinner";
import { debounce } from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useCustomersQueryStates } from "../hooks/useCustomersQueryStates";

export function CustomersSearchBar() {
	const { queryStates, setQueryStates } = useCustomersQueryStates();

	const navigate = useNavigate();
	const location = useLocation();
	// const [loading, setLoading] = useState(false);
	// const prevQueryRef = useRef<string>(queryStates.q);

	const debouncedSearch = useMemo(
		() =>
			debounce(async (query: string) => {
				setQueryStates({ q: query, page: 1 });
			}, 350),
		[location.search, location.pathname, navigate, setQueryStates],
	);

	// const handleQueryChange = async () => {
	//   setLoading(true);

	//   setLoading(false);
	// };

	// useEffect(() => {
	//   const searchParamQuery = queryStates.q || "";
	//   if (searchParamQuery !== prevQueryRef.current) {
	//     prevQueryRef.current = searchParamQuery;
	//     handleQueryChange();
	//   }
	// }, [queryStates.q]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const q = e.target.value;
		debouncedSearch(q);
	};

	return (
		<div
			className="rounded-sm py-1 h-10 px-2 text-sm pl-4
    flex items-center w-full max-w-lg min-w-xs text-t2 border-x"
		>
			<Search size={13} className="text-t3 mr-2" />
			<input
				onChange={handleChange}
				className="outline-none w-full bg-transparent"
				placeholder="Search..."
				defaultValue={queryStates.q}
			></input>
			{/* <div className="w-5 h-5 ml-1">{loading && <SmallSpinner />}</div> */}
		</div>
	);
}
