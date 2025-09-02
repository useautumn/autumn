import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useCustomersQueryStates } from "../../hooks/useCustomersQueryStates";

export const FilterStatusSubMenu = () => {
  const { queryStates, setQueryStates } = useCustomersQueryStates();

  const statuses: string[] = ["canceled", "free_trial", "expired"];
  const selectedStatuses = queryStates.status || [];
  const hasSelections = selectedStatuses.length > 0;

  const toggleStatus = (status: string) => {
    const selected = queryStates.status || [];
    const isSelected = selected.includes(status);

    const updated = isSelected
      ? selected.filter((s: string) => s !== status)
      : [...selected, status];

    setQueryStates({ ...queryStates, status: updated });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="flex items-center justify-between cursor-pointer">
        Status
        {hasSelections && (
          <div className="flex items-center h-4 gap-1 p-1 bg-zinc-200">
            <span className="text-xs text-t3">{selectedStatuses.length}</span>
          </div>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {statuses.map((status: any) => {
          const isActive = selectedStatuses.includes(status);
          return (
            <DropdownMenuItem
              key={status}
              onClick={(e) => {
                e.preventDefault();
                toggleStatus(status);
              }}
              onSelect={(e) => e.preventDefault()}
              className="flex items-center gap-2 cursor-pointer text-sm"
            >
              <Checkbox checked={isActive} />
              {keyToTitle(status)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
