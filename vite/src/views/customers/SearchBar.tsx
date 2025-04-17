import SmallSpinner from "@/components/general/SmallSpinner";
import { debounce } from "lodash";
import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

export function SearchBar({
  query,
  setQuery,
  setCurrentPage,
  mutate,
  setSearching,
}: {
  query: string;
  setQuery: (query: string) => void;
  setCurrentPage: (page: number) => void;
  setSearching: (searching: boolean) => void;
  mutate: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useMemo(
    () =>
      debounce(async (query: string) => {
        setLoading(true);
        setCurrentPage(1);
        setSearching(true);
        await mutate();
        inputRef.current?.focus();
        setLoading(false);
        setSearching(false);
      }, 350),
    []
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;

    setQuery(q);
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
      ></input>
      <div className="w-5 h-5 ml-1">{loading && <SmallSpinner />}</div>
    </div>
  );
}
