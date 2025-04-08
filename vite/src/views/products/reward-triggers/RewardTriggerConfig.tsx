import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { RewardTrigger, Coupon, RewardTriggerEvent } from "@autumn/shared";
import { useProductsContext } from "../ProductsContext";

export const RewardTriggerConfig = ({
  rewardTrigger,
  setRewardTrigger,
}: {
  rewardTrigger: RewardTrigger;
  setRewardTrigger: (rewardTrigger: RewardTrigger) => void;
}) => {
  let { coupons } = useProductsContext();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="w-6/12">
          <FieldLabel>ID</FieldLabel>
          <Input
            value={rewardTrigger.id || ""}
            onChange={(e) =>
              setRewardTrigger({ ...rewardTrigger, id: e.target.value })
            }
          />
        </div>
        <div className="w-6/12">
          <FieldLabel>Redeem On</FieldLabel>
          <Select defaultValue={RewardTriggerEvent.SignUp}>
            <SelectTrigger>
              <SelectValue placeholder="Select a redeem on" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RewardTriggerEvent.SignUp}>Sign Up</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6/12">
          <FieldLabel>Coupon</FieldLabel>
          <Select
            value={rewardTrigger.internal_reward_id}
            onValueChange={(value) =>
              setRewardTrigger({ ...rewardTrigger, internal_reward_id: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a coupon" />
            </SelectTrigger>
            <SelectContent>
              {coupons.map((coupon: Coupon) => (
                <SelectItem key={coupon.name} value={coupon.internal_id}>
                  {coupon.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-6/12">
          <FieldLabel>Max Redemptions</FieldLabel>
          <Input
            value={rewardTrigger.max_redemptions || ""}
            onChange={(e) =>
              setRewardTrigger({
                ...rewardTrigger,
                max_redemptions: parseInt(e.target.value),
              })
            }
          />
          {/* Add infinity */}
        </div>
      </div>
    </div>
  );
};

{
  /* <FieldLabel description="How users redeem the coupon">
        Promotional Code
      </FieldLabel>
      <Input
        value={coupon.promo_codes.length > 0 ? coupon.promo_codes[0].code : ""}
        onChange={(e) =>
          setCoupon({
            ...coupon,
            promo_codes: [{ code: e.target.value }],
          })
          }
        /> */
}
