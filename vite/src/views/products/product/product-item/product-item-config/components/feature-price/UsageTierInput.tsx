import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Infinite } from "@autumn/shared";

export const UsageTierInput = ({
  value,
  onChange,
  type,
}: {
  value: number | string;
  onChange: (e: any) => void;
  type: "from" | "to" | "amount";
}) => {
  if ((type === "to" && value === Infinite) || type === "from") {
    return (
      <Input
        className="outline-none bg-transparent shadow-none flex-grow"
        value={value === Infinite ? "♾️" : value}
        disabled
        type="text"
      />
    );
  }

  return (
    <div className="relative w-full flex">
      <Input
        className={cn("outline-none flex w-full", type === "amount" && "pr-8")}
        value={value}
        onChange={onChange}
        type="number"
        step="any"
      />
      {type === "amount" && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-t3 text-[10px]">
          USD
        </span>
      )}
    </div>
  );
};
