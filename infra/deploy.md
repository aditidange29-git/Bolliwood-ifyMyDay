# Deployment Guide — Bollywood-ify My Day

Replace `bollywood-posters-353842237441` and `353842237441` throughout with your actual values.  
All resources go in **us-east-1** unless noted.

---

## Step 1 — S3 Bucket

### 1a. Create the bucket

```bash
aws s3api create-bucket \
  --bucket bollywood-posters-353842237441 \
  --region us-east-1
```

### 1b. Block Public Access — keep 3 of 4 toggles ON, relax only toggle 2

The bucket-level Block Public Access config must look like this:

```json
{
  "BlockPublicAcls": true,
  "IgnorePublicAcls": true,
  "BlockPublicPolicy": false,
  "RestrictPublicBuckets": false
}
```

Apply it:

```bash
aws s3api put-public-access-block \
  --bucket bollywood-posters-353842237441 \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

> **Why:** `BlockPublicPolicy=false` allows attaching a bucket policy that grants public read.
> `BlockPublicAcls=true` and `IgnorePublicAcls=true` keep ACL-based public access blocked.
> `RestrictPublicBuckets=false` allows the policy statement to take effect for unauthenticated requests.

### 1c. Attach the scoped bucket policy

Edit `infra/s3-bucket-policy.json` — replace `bollywood-posters-353842237441` — then:

```bash
aws s3api put-bucket-policy \
  --bucket bollywood-posters-353842237441 \
  --policy file://infra/s3-bucket-policy.json
```

This grants `s3:GetObject` to `*` **only** on the `posters/*` prefix. All other objects remain private.

### 1d. Add a lifecycle rule to delete posters older than 7 days

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket bollywood-posters-353842237441 \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "expire-posters",
      "Status": "Enabled",
      "Filter": { "Prefix": "posters/" },
      "Expiration": { "Days": 7 }
    }]
  }'
```

---

## Step 2 — IAM Role for Lambda

### 2a. Create the role with Lambda trust policy

```bash
aws iam create-role \
  --role-name bollywood-lambda-role \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"lambda.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }'
```

### 2b. Attach the inline policy

Edit `infra/iam-lambda-policy.json` — replace `bollywood-posters-353842237441` — then:

```bash
aws iam put-role-policy \
  --role-name bollywood-lambda-role \
  --policy-name bollywood-lambda-policy \
  --policy-document file://infra/iam-lambda-policy.json
```

---

## Step 3 — DynamoDB Table (optional — needed for gallery)

```bash
aws dynamodb create-table \
  --table-name bollywood-logs \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

---

## Step 4 — Lambda Function

### 4a. Package the function

```bash
cd backend
zip function.zip lambda_function.py
```

### 4b. Create the function

```bash
aws lambda create-function \
  --function-name bollywood-ify-fn \
  --runtime python3.12 \
  --role arn:aws:iam::353842237441:role/bollywood-lambda-role \
  --handler lambda_function.handler \
  --zip-file fileb://backend/function.zip \
  --timeout 60 \
  --memory-size 512 \
  --environment "Variables={
    BUCKET_NAME=bollywood-posters-353842237441,
    TABLE_NAME=bollywood-logs,
    AWS_REGION_NAME=us-east-1
  }" \
  --region us-east-1
```

> Note: use `AWS_REGION_NAME` (not `AWS_REGION`) — Lambda reserves `AWS_REGION` as a read-only env var.

### 4c. Update function code (after edits)

```bash
cd backend
zip function.zip lambda_function.py
aws lambda update-function-code \
  --function-name bollywood-ify-fn \
  --zip-file fileb://function.zip \
  --region us-east-1
```

---

## Step 5 — API Gateway (HTTP API)

### 5a. Create the HTTP API

```bash
aws apigatewayv2 create-api \
  --name bollywood-ify-api \
  --protocol-type HTTP \
  --cors-configuration \
    AllowOrigins="https://YOUR-FRONTEND-DOMAIN.vercel.app",AllowMethods="POST,GET,OPTIONS",AllowHeaders="Content-Type",MaxAge=300 \
  --region us-east-1
```

Note the `ApiId` returned.

### 5b. Create Lambda integration

```bash
aws apigatewayv2 create-integration \
  --api-id vmny1k24lg \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:us-east-1:353842237441:function:bollywood-ify-fn \
  --payload-format-version 2.0 \
  --region us-east-1
```

Note the `IntegrationId` returned.

### 5c. Create routes

```bash
# POST /bollywood-ify  (trailer + story actions)
aws apigatewayv2 create-route \
  --api-id vmny1k24lg \
  --route-key "POST /bollywood-ify" \
  --target integrations/YOUR-INTEGRATION-ID \
  --region us-east-1

# GET /gallery  (optional gallery listing)
aws apigatewayv2 create-route \
  --api-id vmny1k24lg \
  --route-key "GET /gallery" \
  --target integrations/YOUR-INTEGRATION-ID \
  --region us-east-1
```

### 5d. Deploy the API

```bash
aws apigatewayv2 create-stage \
  --api-id vmny1k24lg \
  --stage-name prod \
  --auto-deploy \
  --region us-east-1
```

Your invoke URL will be: `https://vmny1k24lg.execute-api.us-east-1.amazonaws.com/prod`

### 5e. Grant API Gateway permission to invoke Lambda

```bash
aws lambda add-permission \
  --function-name bollywood-ify-fn \
  --statement-id apigw-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:353842237441:vmny1k24lg/*/*" \
  --region us-east-1
```

---

## Step 6 — Frontend (Vercel)

1. Set environment variable in Vercel project settings:
   - Key: `VITE_API_URL`
   - Value: `https://vmny1k24lg.execute-api.us-east-1.amazonaws.com/prod`

2. Deploy from the `frontend/` directory:
   ```bash
   cd frontend
   npm install
   npm run build
   # then push to GitHub and connect repo to Vercel,
   # or use Vercel CLI: npx vercel --prod
   ```

3. After deploy, update the API Gateway CORS `AllowOrigins` to your actual Vercel URL.

---

## Checklist

- [ ] S3 bucket created and policy applied
- [ ] Block Public Access configured (toggle 2 OFF only)
- [ ] Lifecycle rule added
- [ ] IAM role created with inline policy
- [ ] DynamoDB table created (if using gallery)
- [ ] Lambda function deployed with correct env vars
- [ ] API Gateway HTTP API created, routes wired, stage deployed
- [ ] Lambda resource policy grants API Gateway invocation
- [ ] Frontend deployed on Vercel with `VITE_API_URL` set
- [ ] CORS updated to actual frontend domain
