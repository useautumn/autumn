# Platform API Reference

The Platform API allows you to manage organizations and Stripe Connect accounts on behalf of your tenants. All endpoints require platform feature access.

## Authentication

All Platform API endpoints require:
- Valid Autumn API key in the `Authorization` header
- Platform feature enabled for your organization

```bash
Authorization: Bearer am_sk_test_...
```

---

## Endpoints

### POST /v1/platform/beta/organization

Creates a new organization for a platform tenant. Reuses existing users and organizations if they already exist.

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_email` | string | Yes | Email address of the organization owner. User will be created if it doesn't exist. |
| `name` | string | Yes | Display name for the organization. |
| `slug` | string | Yes | Unique slug for the organization (will be prefixed with your org ID). |
| `env` | enum | No | Environment(s) to create API keys for: `"test"`, `"live"`, or `"both"`. Defaults to `"both"`. |

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `test_secret_key` | string? | Autumn test API key for the organization (if `env` is `"test"` or `"both"`). |
| `live_secret_key` | string? | Autumn live API key for the organization (if `env` is `"live"` or `"both"`). |

**Example:**

```bash
curl -X POST https://api.useautumn.com/v1/platform/beta/organization \
  -H "Authorization: Bearer am_sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{
    "user_email": "tenant@example.com",
    "name": "Tenant Organization",
    "slug": "tenant-org",
    "env": "both"
  }'
```

**Response:**
```json
{
  "test_secret_key": "am_sk_test_abc123...",
  "live_secret_key": "am_sk_live_xyz789..."
}
```

**Notes:**
- If a user with the email already exists, it will be reused
- If an organization with the slug already exists for this user, it will be reused
- The actual organization slug stored will be `{slug}_{your_org_id}` to ensure uniqueness
- Returns Autumn API keys that your tenant can use to interact with Autumn

---

### POST /v1/platform/beta/oauth_url

Generates a Stripe Connect OAuth URL for a platform organization. Use this to allow your tenants to connect their Stripe accounts.

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `organization_slug` | string | Yes | The slug of the organization (without the org ID prefix). |
| `env` | enum | Yes | Environment: `"test"` or `"live"`. |
| `redirect_url` | string | Yes | URL to redirect to after OAuth completion. |

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `oauth_url` | string | Stripe Connect OAuth URL to redirect the user to. |

**Example:**

```bash
curl -X POST https://api.useautumn.com/v1/platform/beta/oauth_url \
  -H "Authorization: Bearer am_sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{
    "organization_slug": "tenant-org",
    "env": "test",
    "redirect_url": "https://yourapp.com/stripe/callback"
  }'
```

**Response:**
```json
{
  "oauth_url": "https://connect.stripe.com/oauth/v2/authorize?response_type=code&client_id=ca_xxx&scope=read_write&state=abc123&redirect_uri=https://express.dev.useautumn.com/stripe/oauth_callback"
}
```

**OAuth Flow:**
1. Call this endpoint to get the OAuth URL
2. Redirect your tenant to the `oauth_url`
3. User authorizes their Stripe account
4. Stripe redirects to Autumn's callback URL
5. Autumn processes the authorization and redirects to your `redirect_url`
6. Your `redirect_url` will receive query parameters:
   - `success=true` or `success=false`
   - `message=...` (if error occurred)

**Notes:**
- OAuth state is stored in Upstash with 10-minute expiry
- The organization must have been created via the platform API
- After successful OAuth, the Stripe account is automatically linked to the tenant organization

---

### POST /v1/platform/beta/organization/stripe

Updates a platform organization's Stripe Connect configuration. Associates a Stripe account ID with the organization using your master Stripe credentials.

**Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `organization_slug` | string | Yes | The slug of the organization (without the org ID prefix). |
| `test_account_id` | string | No* | Stripe account ID for test environment (e.g., `acct_xxx`). |
| `live_account_id` | string | No* | Stripe account ID for live environment (e.g., `acct_xxx`). |

*At least one of `test_account_id` or `live_account_id` must be provided.

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Success message. |
| `organization.id` | string | Internal organization ID. |
| `organization.slug` | string | Organization slug (without prefix). |

**Example:**

```bash
curl -X POST https://api.useautumn.com/v1/platform/beta/organization/stripe \
  -H "Authorization: Bearer am_sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{
    "organization_slug": "tenant-org",
    "test_account_id": "acct_1234567890",
    "live_account_id": "acct_0987654321"
  }'
```

**Response:**
```json
{
  "message": "Stripe Connect configuration updated successfully",
  "organization": {
    "id": "org_abc123",
    "slug": "tenant-org"
  }
}
```

**Validation:**
- Your organization must have the corresponding Stripe secret key connected (test/live)
- The endpoint validates that your master Stripe account can access the provided account ID
- If validation fails, you'll receive a descriptive error message

**Notes:**
- Use this endpoint when you want to manage Stripe accounts on behalf of your tenants using your own Stripe Connect credentials
- The `master_org_id` is automatically set to your organization ID
- All Stripe operations for the tenant will use your master Stripe credentials with the tenant's account ID
- This is an alternative to the OAuth flow for cases where you have direct access to the tenant's Stripe account ID

---

### GET /v1/platform/beta/users

Lists all users created by your master organization. Supports pagination and optional expansion of related organizations.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | integer | No | 10 | Number of users to return (1-100). |
| `offset` | integer | No | 0 | Number of users to skip for pagination. |
| `expand` | string | No | - | Comma-separated list of fields to expand. Currently supports: `"organizations"`. |

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `list` | array | Array of user objects. |
| `list[].email` | string | User's email address. |
| `list[].created_at` | number | Timestamp (milliseconds since epoch) when the user was created. |
| `list[].organizations` | array? | Array of organization objects (only if `expand=organizations` is set). |
| `list[].organizations[].slug` | string | Organization slug (without master org prefix). |
| `list[].organizations[].name` | string | Organization name. |
| `list[].organizations[].created_at` | number | Timestamp (milliseconds since epoch) when the organization was created. |
| `total` | number | Total number of users returned. |
| `limit` | number | Limit used in the query. |
| `offset` | number | Offset used in the query. |

**Example:**

```bash
curl -X GET 'https://api.useautumn.com/v1/platform/beta/users?limit=20&offset=0&expand=organizations' \
  -H "Authorization: Bearer am_sk_test_..."
```

**Response:**
```json
{
  "list": [
    {
      "email": "tenant1@example.com",
      "created_at": 1704067200000,
      "organizations": [
        {
          "slug": "tenant-org-1",
          "name": "Tenant Organization 1",
          "created_at": 1704067200000
        }
      ]
    },
    {
      "email": "tenant2@example.com",
      "created_at": 1704153600000,
      "organizations": [
        {
          "slug": "tenant-org-2",
          "name": "Tenant Organization 2",
          "created_at": 1704153600000
        }
      ]
    }
  ],
  "total": 2,
  "limit": 20,
  "offset": 0
}
```

**Notes:**
- Only returns users that were created by your master organization
- Use the `expand` parameter to include the organizations each user belongs to
- Organizations are limited to 100 per user

---

### GET /v1/platform/beta/orgs

Lists all organizations created by your master organization. Supports pagination.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | integer | No | 10 | Number of organizations to return (1-100). |
| `offset` | integer | No | 0 | Number of organizations to skip for pagination. |

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `list` | array | Array of organization objects. |
| `list[].slug` | string | Organization slug (without master org prefix). |
| `list[].name` | string | Organization name. |
| `list[].created_at` | number | Timestamp (milliseconds since epoch) when the organization was created. |
| `total` | number | Total number of organizations returned. |
| `limit` | number | Limit used in the query. |
| `offset` | number | Offset used in the query. |

**Example:**

```bash
curl -X GET 'https://api.useautumn.com/v1/platform/beta/orgs?limit=20&offset=0' \
  -H "Authorization: Bearer am_sk_test_..."
```

**Response:**
```json
{
  "list": [
    {
      "slug": "tenant-org-1",
      "name": "Tenant Organization 1",
      "created_at": 1704067200000
    },
    {
      "slug": "tenant-org-2",
      "name": "Tenant Organization 2",
      "created_at": 1704153600000
    }
  ],
  "total": 2,
  "limit": 20,
  "offset": 0
}
```

**Notes:**
- Only returns organizations that were created by your master organization
- Organization slugs in the response do not include the master org ID prefix

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "message": "Error description",
  "code": "error_code"
}
```

### Common Error Codes:

| Code | Status | Description |
|------|--------|-------------|
| `not_found` | 404 | Organization not found or doesn't exist. |
| `forbidden` | 403 | You don't have permission to manage this organization. |
| `invalid_input` | 400 | Invalid request parameters or missing required fields. |
| `internal_error` | 500 | Internal server error. |
| `not_allowed` | 403 | Platform feature not enabled for your organization. |

**Example Error Response:**
```json
{
  "message": "Organization with slug 'tenant-org' not found",
  "code": "not_found"
}
```

---

## Rate Limits

Platform API endpoints share the same rate limits as other Autumn API endpoints. Contact support if you need higher rate limits.

---

## Support

For questions or issues with the Platform API, contact:
- Email: hey@useautumn.com
- Documentation: https://docs.useautumn.com
