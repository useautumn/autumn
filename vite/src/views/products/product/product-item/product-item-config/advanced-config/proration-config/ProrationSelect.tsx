import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OnDecrease, OnIncrease } from "@autumn/shared";

export const ProrationSelect = ({
  value,
  setValue,
  optionToText,
  options,
}: {
  value: OnDecrease | OnIncrease;
  setValue: (value: OnDecrease | OnIncrease) => void;
  optionToText: any;
  options: (OnDecrease | OnIncrease)[];
}) => {
  return (
    <Select
      value={value}
      onValueChange={(value) => setValue(value as OnDecrease | OnIncrease)}
    >
      <SelectTrigger className="w-full min-w-48 max-w-72">
        <SelectValue className="w-full">
          <span className="text-sm truncate overflow-hidden block w-full">
            {optionToText(value)}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((value) => (
          <SelectItem key={value} value={value}>
            {optionToText(value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
