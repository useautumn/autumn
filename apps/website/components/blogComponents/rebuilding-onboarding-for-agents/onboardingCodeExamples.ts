export const CATALOG_CODE = `const pro = plan({
  id: "pro",
  licenses: [{ licensePlanId: seat.id }],
  items: [sharedPrepaidCredits],
});`;

export const INTEGRATION_CODE = `await autumn.billing.attach(subscription);

if ((await autumn.check(usage)).allowed) {
  await generateReply();
  await autumn.track(usage);
}`;
