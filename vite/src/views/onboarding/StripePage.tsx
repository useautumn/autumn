import ConnectStripe from "./ConnectStripe";

export default function StripePage() {
  return (
    <>
      <div className="flex flex-col items-center justify-center h-full w-full max-w-[1048px]">
        <div className="w-[430px] mb-[100px] shadow-lg rounded-2xl border flex flex-col p-8 bg-background gap-4">
          <div>
            <p className="text-md font-bold text-t2">
              Please connect your Stripe account
            </p>
            <p className="text-t3 text-xs mt-1">
              Your credentials will be encrypted and stored safely
            </p>
          </div>
          <ConnectStripe />
        </div>
      </div>
    </>
  );
}
