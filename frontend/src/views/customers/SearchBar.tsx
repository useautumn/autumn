import SmallSpinner from "@/components/general/SmallSpinner";
import { faMagnifyingGlass } from "@fortawesome/pro-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { debounce } from "lodash";
import { useMemo, useRef, useState } from "react";

export function SearchBar({
  query,
  setQuery,
  setCurrentPage,
  mutate,
}: {
  query: string;
  setQuery: (query: string) => void;
  setCurrentPage: (page: number) => void;
  mutate: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useMemo(
    () =>
      debounce(async (query: string) => {
        setLoading(true);
        setCurrentPage(1);
        await mutate();
        inputRef.current?.focus();
        setLoading(false);
      }, 350),
    [mutate, setCurrentPage]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;

    setQuery(q);
    debouncedSearch(q);
  };

  return (
    <div
      className="rounded-md border-1 shadow-sm py-1 h-7 px-2 text-sm 
    flex items-center w-full max-w-xs bg-white"
    >
      <FontAwesomeIcon
        icon={faMagnifyingGlass}
        className="text-t3 mr-2"
        size="sm"
      />
      <input
        onChange={handleChange}
        className="outline-none w-full bg-transparent"
        placeholder="Search..."
      ></input>
      {loading && <SmallSpinner />}
    </div>
    // <Input
    //   type="text"
    //   placeholder="Search customers..."
    //   value={query}
    //   onChange={handleChange}
    //   // autoFocus
    //   className="pr-8 max-w-md"
    //   ref={inputRef}
    //   endContent={
    //     loading && (
    //       <div className="absolute right-2 top-2">
    //         <Loader2 className="h-5 w-5 animate-spin text-primary" />
    //       </div>
    //     )
    //   }
    // />
  );
}
