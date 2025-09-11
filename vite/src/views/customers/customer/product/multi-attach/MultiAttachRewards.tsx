import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useCustomerContext } from "../../CustomerContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Reward, RewardType } from "@autumn/shared";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useOrg } from "@/hooks/common/useOrg";

export const AddRewardButton = ({
  setAttachRewards,
}: {
  setAttachRewards: (rewards: any) => void;
}) => {
  return (
    <Button
      size="sm"
      className="w-fit"
      variant="secondary"
      startIcon={<Plus size={12} />}
      onClick={() => {
        setAttachRewards((prev: any) => [
          ...prev,
          { reward_id: null, quantity: 1 },
        ]);
      }}
    >
      Add Rewards
    </Button>
  );
};

export const MultiAttachRewards = ({
  attachRewards,
  setAttachRewards,
  sub,
}: {
  attachRewards: any;
  setAttachRewards: (rewards: any) => void;
  sub: any;
}) => {
  const { org } = useOrg();
  const { rewards } = useRewardsQuery();
  const subDiscounts = sub?.discounts || [];

  const noRewards = attachRewards.length === 0 && subDiscounts.length === 0;

  if (!rewards || !attachRewards || noRewards) return null;

  const formatReward = (reward: Reward) => {
    if (reward.type === RewardType.PercentageDiscount) {
      return (
        <>
          {reward.name}{" "}
          <span className="text-t3">
            - {reward.discount_config?.discount_value}% off
          </span>
        </>
      );
    } else if (reward.type === RewardType.FixedDiscount) {
      return (
        <>
          {reward.name}{" "}
          <span className="text-t3">
            - {reward.discount_config?.discount_value}{" "}
            {(org.default_currency || "usd").toUpperCase()} off
          </span>
        </>
      );
    }
  };

  const getSubDiscountName = (subDiscount: any) => {
    const correspondingReward = rewards.find(
      (r: Reward) => r.id === subDiscount.coupon.id
    );

    const name =
      correspondingReward?.name ||
      subDiscount.coupon.name ||
      subDiscount.coupon.id;

    const amountOff = subDiscount.coupon.percent_off
      ? `${subDiscount.coupon.percent_off}% off`
      : `${subDiscount.coupon.amount_off} ${org.default_currency?.toUpperCase()} off`;

    return `${name} - ${amountOff}`;
  };

  const filteredRewards = rewards.filter((r: Reward) => {
    if (
      r.type === RewardType.PercentageDiscount ||
      r.type === RewardType.FixedDiscount
    ) {
      const subDiscount = subDiscounts.find((sd: any) => sd.coupon.id === r.id);

      if (subDiscount) {
        return false;
      }
      return true;
    }

    return false;
  });

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div>
        <FieldLabel>Rewards</FieldLabel>
        <div className="flex flex-col gap-2 max-w-80">
          {subDiscounts.map((subDiscount: any, index: number) => (
            <Select key={index} value={subDiscount.coupon.id} disabled>
              <SelectTrigger className="overflow-hidden">
                <SelectValue>{getSubDiscountName(subDiscount)}</SelectValue>
              </SelectTrigger>
            </Select>
          ))}
          {attachRewards.map((attachReward: any, index: number) => (
            <div className="flex gap-1 items-center" key={index}>
              <Select
                value={attachReward.reward_id}
                onValueChange={(value) => {
                  for (let i = 0; i < attachRewards.length; i++) {
                    if (i === index) continue;
                    if (attachRewards[i].reward_id === value) {
                      toast.error("Reward already added");
                      return;
                    }
                  }
                  setAttachRewards((prev: any) =>
                    prev.map((r: any, i: number) =>
                      i === index ? { ...r, reward_id: value } : r
                    )
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a reward">
                    {rewards.find(
                      (r: any) => r.id === attachReward.reward_id
                    ) ? (
                      formatReward(
                        rewards.find(
                          (r: any) => r.id === attachReward.reward_id
                        )
                      )
                    ) : (
                      <span className="text-t3">Select a reward</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {filteredRewards.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>
                      {formatReward(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="icon"
                variant="ghost"
                isIcon
                onClick={() => {
                  setAttachRewards((prev: any) =>
                    prev.filter(
                      (_: any, index: number) =>
                        index !== attachRewards.length - 1
                    )
                  );
                }}
              >
                <X size={12} className="text-t3" />
              </Button>
            </div>
          ))}
        </div>
      </div>
      <AddRewardButton setAttachRewards={setAttachRewards} />
    </div>
  );
};
