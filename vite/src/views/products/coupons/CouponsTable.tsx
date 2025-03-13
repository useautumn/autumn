import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useProductsContext } from "../ProductsContext";
import { CouponRowToolbar } from "./CouponRowToolbar";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { Coupon, CouponDurationType, DiscountType } from "@autumn/shared";

export const CouponsTable = () => {
  const { coupons, org } = useProductsContext();
  // const [selectedCreditSystem, setSelectedCreditSystem] =
  //   useState<Feature | null>(null);
  // const [open, setOpen] = useState(false);

  // const handleRowClick = (id: string) => {
  //   const creditSystem = creditSystems.find(
  //     (creditSystem: Feature) => creditSystem.id === id
  //   );
  //   console.log(creditSystem);
  //   if (!creditSystem) return;

  //   setSelectedCreditSystem(creditSystem);
  //   setOpen(true);
  // };

  return (
    <>
      {/* <UpdateCreditSystem
          open={open}
          setOpen={setOpen}
          selectedCreditSystem={selectedCreditSystem!}
          setSelectedCreditSystem={setSelectedCreditSystem}
        /> */}
      <Table>
        <TableHeader className="rounded-full">
          <TableRow>
            <TableHead className="">Name</TableHead>
            <TableHead>Promo Codes</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Duration</TableHead>

            <TableHead className="min-w-0 w-28">Created At</TableHead>
            <TableHead className="min-w-0 w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coupons.map((coupon: Coupon) => (
            <TableRow key={coupon.internal_id} className="cursor-pointer">
              <TableCell className="font-medium">{coupon.name}</TableCell>
              <TableCell className="font-mono">
                {coupon.promo_codes
                  .map((promoCode) => promoCode.code)
                  .join(", ")}
              </TableCell>
              <TableCell className="min-w-32">
                <div className="flex items-center gap-1">
                  <p>{coupon.discount_value} </p>
                  <p className="text-t3">
                    {coupon.discount_type == DiscountType.Percentage
                      ? "%"
                      : org?.default_currency || "USD"}
                  </p>
                </div>
              </TableCell>
              <TableCell className="">
                {coupon.duration_type == CouponDurationType.Months
                  ? `${coupon.duration_value} months`
                  : coupon.duration_type == CouponDurationType.OneOff &&
                    coupon.should_rollover
                  ? "One-off (rollover)"
                  : keyToTitle(coupon.duration_type)}
              </TableCell>
              <TableCell className="">
                {formatUnixToDateTime(coupon.created_at).date}
                <span className="text-t3">
                  {" "}
                  {formatUnixToDateTime(coupon.created_at).time}{" "}
                </span>
              </TableCell>
              <TableCell className="">
                <CouponRowToolbar coupon={coupon} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};
