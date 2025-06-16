import { Tabs } from "@/components/ui/tabs";
import CreateFixedPrice from "../../prices/CreateFixedPrice";
import { useProductItemContext } from "../ProductItemContext";

export default function FixedPriceConfig({
  show,
  setShow,
}: {
  show: any;
  setShow: (show: any) => void;
}) {
  const { item, setItem } = useProductItemContext();

  return (
    <div className="!overflow-visible flex flex-col gap-4 w-full">
      <CreateFixedPrice
        config={item}
        setConfig={setItem}
        show={show}
        setShow={setShow}
      />
    </div>
  );
}
