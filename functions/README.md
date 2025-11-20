# Firebase Cloud Functions

This directory contains the Firebase Cloud Functions for the Cash Drawer Calculator app.

## Functions

### 1. createCheckoutSession
Creates a Stripe Checkout Session for upgrading to Supporter tier.

**Endpoint:** `https://us-central1-[PROJECT_ID].cloudfunctions.net/createCheckoutSession`

**Method:** POST

**Request Body:**
```json
{
  "userId": "firebase-user-id",
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

### 2. stripeWebhook
Handles Stripe webhook events for payment and subscription updates.

**Endpoint:** `https://us-central1-[PROJECT_ID].cloudfunctions.net/stripeWebhook`

**Method:** POST

**Events Handled:**
- `checkout.session.completed` - Updates user tier to "supporter"
- `customer.subscription.updated` - Updates user tier based on subscription status
- `customer.subscription.created` - Updates user tier based on subscription status
- `customer.subscription.deleted` - Downgrades user tier to "user"

## Required Environment Variables

Configure these secrets in Firebase:

1. **STRIPE_SECRET_KEY** - Your Stripe secret key (sk_test_... or sk_live_...)
2. **STRIPE_WEBHOOK_SECRET** - Your Stripe webhook signing secret (whsec_...)
3. **STRIPE_PRICE_ID** - Your Stripe Price ID for the Supporter subscription (price_...)

## Setup

1. Install dependencies:
   ```bash
   cd functions
   npm install
   ```

2. Set secrets:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   firebase functions:secrets:set STRIPE_PRICE_ID
   ```

3. Deploy:
   ```bash
   firebase deploy --only functions
   ```

## Stripe Webhook Configuration

After deploying the `stripeWebhook` function:

1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://us-central1-[PROJECT_ID].cloudfunctions.net/stripeWebhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the webhook signing secret and set it as `STRIPE_WEBHOOK_SECRET`

## Testing

Use the Stripe CLI to test webhooks locally:

```bash
stripe listen --forward-to http://localhost:5001/[PROJECT_ID]/us-central1/stripeWebhook
```
