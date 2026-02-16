# OpenAPI v2.1 Migration Checklist

## API Endpoints

### Customers
- [x] getOrCreate
- [ ] list
- [ ] update
- [ ] delete

### Plans
- [x] list
- [x] get
- [ ] create
- [ ] update
- [ ] delete

### Features
- [ ] list
- [ ] get
- [ ] create
- [ ] update
- [ ] delete

### Referrals
- [ ] createCode
- [ ] redeemCode

### Balances
- [ ] create
- [ ] update
- [ ] check
- [ ] track

### Billing
- [x] attach
- [ ] previewAttach
- [ ] update
- [ ] previewUpdate
- [ ] setupPayment
- [ ] openCustomerPortal

### Events
- [ ] list
- [ ] aggregate

---

## SDK Hooks (autumn-js)

- [ ] useCustomer
- [ ] useEntity
- [ ] useListEvents
- [ ] useAggregateEvents
- [ ] useListPlans
