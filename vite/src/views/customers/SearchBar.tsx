import SmallSpinner from "@/components/general/SmallSpinner";
import { debounce } from "lodash";
import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

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
      className="rounded-sm py-1 h-8 px-2 text-sm 
    flex items-center w-full max-w-xs"
    >
      <Search size={13} className="text-t3 mr-2" />
      <input
        onChange={handleChange}
        className="outline-none w-full bg-transparent"
        placeholder="Search..."
      ></input>
      <div className="w-5 h-5">{loading && <SmallSpinner />}</div>
    </div>
  );
}
