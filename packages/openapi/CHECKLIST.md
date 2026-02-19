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
- [x] create
- [x] update
- [x] check
- [x] track

### Billing
- [x] attach
- [x] previewAttach
- [x] update
- [x] previewUpdate
- [x] setupPayment
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
