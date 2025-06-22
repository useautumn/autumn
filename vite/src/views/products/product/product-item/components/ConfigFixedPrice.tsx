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
    <CreateFixedPrice
      config={item}
      setConfig={setItem}
      show={show}
      setShow={setShow}
    />
  );
}
