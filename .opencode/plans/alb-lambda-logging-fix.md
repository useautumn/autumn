# ALB Lambda Logging Fix

**Date:** 2026-03-04
**Status:** ✅ Fixed

## Problem

Express logs contain `req.id` (AWS ALB trace IDs) that don't exist in the `alb` Axiom dataset. Investigation showed ~40-60% of ALB logs for high-traffic orgs (e.g., `0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx`) were missing.

## Root Cause

The Lambda functions processing ALB logs (S3 → Lambda → Axiom) were **timing out and running out of memory** on large log files.

### Lambda Config
| Setting | Before | After |
|---------|--------|-------|
| Memory | 256 MB | 1024 MB |
| Timeout | 60 sec | 180 sec |

### Evidence
- CloudWatch showed ~100% error rate (72 invocations, 72 errors per hour)
- Errors: `Status: timeout` and `Runtime.OutOfMemory`
- Small files (164KB) processed successfully (~2000 logs in 3s)
- Large files (6-7MB compressed) failed consistently
- Same files retried multiple times before being abandoned

## Fix Applied

Lambda configuration updated via AWS Console:
- `alb-listener-us-east-2`: Memory 1024MB, Timeout 180s
- `alb-listener-us-west-2`: Check if same fix needed

## Verification (run after 24 hours)

### 1. Check Lambda errors are gone:
```bash
aws cloudwatch get-metric-statistics --region us-east-2 \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=alb-listener-us-east-2 \
  --start-time $(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 3600 \
  --statistics Sum
```

### 2. Compare ALB vs Express trace IDs in Axiom:
```apl
// Sample express trace IDs for an org
['express']
| where ['context.org_id'] == '0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx'
| where isnotnull(['req.id']) and ['req.id'] startswith "Root="
| where ['_time'] > ago(1h)
| summarize count() by ['req.id']
| take 10

// Then verify each exists in ALB
['alb'] 
| where ['trace_id'] == "<trace_id_from_above>"
```

### 3. Check invocation success rate:
```bash
# Invocations
aws cloudwatch get-metric-statistics --region us-east-2 \
  --namespace AWS/Lambda --metric-name Invocations \
  --dimensions Name=FunctionName,Value=alb-listener-us-east-2 \
  --start-time $(date -u -v-6H +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 3600 --statistics Sum

# Errors (should be 0 or near 0)
aws cloudwatch get-metric-statistics --region us-east-2 \
  --namespace AWS/Lambda --metric-name Errors \
  --dimensions Name=FunctionName,Value=alb-listener-us-east-2 \
  --start-time $(date -u -v-6H +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 3600 --statistics Sum
```

## Related Resources
- S3 Buckets: `autumn-alb-us-east-2`, `autumn-alb-us-west-2`
- Lambdas: `alb-listener-us-east-2`, `alb-listener-us-west-2`
- ALBs: `fc-server-oyknwa-9b105z0` (us-east-2), `fc-server-ndcdwy-65bl04in` (us-west-2)

## Notes
- Backfilling missed logs is possible but tedious (manual Lambda re-invocation per S3 file)
- No DLQ was configured, so failed events were discarded after retries
- Consider adding a DLQ in future to catch failed processing attempts
