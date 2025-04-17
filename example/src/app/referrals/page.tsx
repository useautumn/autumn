"use client";

import { useEffect, useState } from "react";
import { getReferralCode, redeemReferralCode } from "./functions";
import { toast } from "sonner";
import { attachProduct, getCustomer } from "../autumn-functions";
import { Input } from "@/components/ui/input";

const useReferralCode = (referrerId: string) => {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchReferralCode = async () => {
      setLoading(true);
      try {
        const { code } = await getReferralCode(referrerId);
        setReferralCode(code);
      } catch (error) {
        console.log("Failed to get referral code", error);
        toast.error(`Error fetching referral code: ${error}`);
      }
      setLoading(false);
    };
    fetchReferralCode();
  }, []);

  return { referralCode, isLoading: loading };
};

const useCustomer = (customerId: string) => {
  const [customer, setCustomer] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchCustomer = async () => {
    setIsLoading(true);
    const customerData = await getCustomer(customerId);
    setCustomer(customerData);
    setIsLoading(false);
  };

  const refresh = async () => {
    const customerData = await getCustomer(customerId);
    setCustomer(customerData);
  };

  useEffect(() => {
    fetchCustomer();
  }, []);

  return { ...customer, isLoading, refresh };
};

export default function ReferralsPage() {
  const { referralCode, isLoading } = useReferralCode("ayush");
  const { entitlements } = useCustomer("ayush");

  const referrerId = "ayush";
  const referee1Id = "john";
  const [referral1Code, setReferral1Code] = useState<string>("");

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-mono mb-8 text-zinc-800">
          Referral Program
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Referrer Section */}
          <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-sm">
            <div className="space-y-4">
              <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
                <span className="text-xs font-mono text-zinc-500">
                  USER ID:
                </span>
                <span className="font-mono text-sm text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded">
                  {referrerId}
                </span>
              </div>
              <h2 className="text-lg font-mono text-zinc-700">
                Your Referral Code
              </h2>
              <div className="bg-zinc-50 p-4 rounded-md border border-zinc-200">
                <p className="font-mono text-lg tracking-wide text-zinc-800">
                  {isLoading
                    ? "Loading..."
                    : referralCode || "No code available"}
                </p>
              </div>
              {entitlements && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-sm font-mono text-zinc-600">
                    Your Features
                  </h3>
                  {entitlements.map((entitlement: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 bg-zinc-50 rounded-md"
                    >
                      <span className="font-mono text-sm text-zinc-700">
                        {entitlement.feature_id}
                      </span>
                      <span className="font-mono text-sm bg-zinc-200 px-2 py-1 rounded">
                        {entitlement.balance}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Referee Section */}
          <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-sm">
            <div className="space-y-4">
              <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
                <span className="text-xs font-mono text-zinc-500">
                  USER ID:
                </span>
                <span className="font-mono text-sm text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded">
                  {referee1Id}
                </span>
              </div>
              <h2 className="text-lg font-mono text-zinc-700">Redeem Code</h2>
              <div className="space-y-2">
                <p className="text-sm font-mono text-zinc-600">
                  Enter referral code to get started
                </p>
                <Input
                  value={referral1Code}
                  onChange={(e) => setReferral1Code(e.target.value)}
                  placeholder="Enter code"
                  className="font-mono text-base"
                />
                <button
                  onClick={async () => {
                    try {
                      await redeemReferralCode({
                        customerId: referee1Id,
                        referralCode: referral1Code,
                      });

                      const { checkout_url } = await attachProduct({
                        customerId: referee1Id,
                        productId: "pro",
                      });

                      if (checkout_url) {
                        window.open(checkout_url, "_blank");
                      } else {
                        toast.error("Something went wrong");
                      }
                    } catch (error) {
                      console.log("Failed to redeem code", error);
                      toast.error("Failed to redeem code");
                    }
                  }}
                  className="w-full mt-4 bg-zinc-800 hover:bg-zinc-700 text-white font-mono py-2 px-4 rounded-md transition-colors"
                >
                  Redeem & Purchase Pro
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
