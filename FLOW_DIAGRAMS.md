# Payment Flow Diagram

## Before (Payment Link)

```
┌─────────────┐
│   User      │
│  (Browser)  │
└──────┬──────┘
       │ 1. Click "Upgrade"
       │
       ▼
┌─────────────────────────────────────────┐
│  index.html / main.js                   │
│  • Constructs payment link URL          │
│  • Redirects to Stripe payment link     │
└──────┬──────────────────────────────────┘
       │ 2. Redirect to Stripe
       │
       ▼
┌──────────────────────────────────────────┐
│  Stripe Payment Link                     │
│  buy.stripe.com/test_dRm...              │
│  • User enters payment details           │
│  • Completes checkout                    │
└──────┬───────────────────────────────────┘
       │ 3. Payment success
       │
       ├──> success.html
       │    (redirect)
       │
       └──> Stripe Webhook
            (sends events to webhook handler)
                 │
                 ▼
            ┌─────────────────────────┐
            │  Webhook Handler        │
            │  • Updates tier         │
            │  • Updates customer     │
            └─────────────────────────┘
```

## After (Stripe API)

```
┌─────────────┐
│   User      │
│  (Browser)  │
└──────┬──────┘
       │ 1. Click "Upgrade"
       │
       ▼
┌─────────────────────────────────────────┐
│  index.html / main.js                   │
│  • Calls createCheckoutSession()        │
│  • Shows loading state                  │
└──────┬──────────────────────────────────┘
       │ 2. Call Cloud Function
       │
       ▼
┌──────────────────────────────────────────┐
│  Firebase Cloud Function                 │
│  createCheckoutSession()                 │
│  • Validates userId                      │
│  • Creates Stripe Checkout Session       │
│  • Returns session URL                   │
└──────┬───────────────────────────────────┘
       │ 3. Return session URL
       │
       ▼
┌─────────────────────────────────────────┐
│  Browser                                 │
│  • Receives session URL                  │
│  • Redirects to Stripe Checkout          │
└──────┬──────────────────────────────────┘
       │ 4. Redirect to Stripe
       │
       ▼
┌──────────────────────────────────────────┐
│  Stripe Checkout Session                 │
│  checkout.stripe.com/c/pay/cs_...        │
│  • User enters payment details           │
│  • Completes checkout                    │
└──────┬───────────────────────────────────┘
       │ 5. Payment success
       │
       ├──> success.html
       │    • Sets localStorage flag
       │    • Redirects to homepage
       │    • Shows success message
       │
       └──> Stripe Webhook
            (immediately sends checkout.session.completed)
                 │
                 ▼
            ┌─────────────────────────────────┐
            │  Webhook Handler                │
            │  stripeWebhook()                │
            │  • Verifies signature           │
            │  • Updates tier to "supporter"  │
            │  • Saves customer ID            │
            │  • Handles subscription events  │
            └─────────────────────────────────┘
                       │
                       ▼
            ┌─────────────────────────────────┐
            │  Firestore                      │
            │  users/{userId}                 │
            │  • tier: "supporter"            │
            │  • upgradedAt: timestamp        │
            │                                 │
            │  customers/{userId}             │
            │  • customer_id: "cus_..."       │
            └─────────────────────────────────┘
```

## Key Improvements

### 1. Better Security
- **Before**: Payment link required embedding sensitive data in URL
- **After**: Cloud Function validates user and creates session server-side

### 2. More Control
- **Before**: Limited customization of checkout flow
- **After**: Full control over session parameters, pricing, and user experience

### 3. Immediate Updates
- **Before**: Tier update depends on webhook/subscription creation timing
- **After**: Tier updated immediately on `checkout.session.completed`

### 4. Better Error Handling
- **Before**: Hard to detect and handle checkout errors
- **After**: Loading states, error messages, and proper user feedback

### 5. Flexibility
- **Before**: Hard-coded payment link URL
- **After**: Environment-based configuration (test/prod)

## Dark Mode Flow

```
┌─────────────┐
│   User      │
│  (Browser)  │
└──────┬──────┘
       │ 1. Click dark mode checkbox
       │
       ▼
┌─────────────────────────────────────────┐
│  index.html                              │
│  <input id="darkModeToggle">            │
└──────┬──────────────────────────────────┘
       │ 2. Change event
       │
       ▼
┌─────────────────────────────────────────┐
│  main.js                                 │
│  addEventListener('change', ...)         │
└──────┬──────────────────────────────────┘
       │ 3. Call toggleDarkMode()
       │
       ▼
┌─────────────────────────────────────────┐
│  auth.js                                 │
│  window.toggleDarkMode()                 │
│  • Checks if user is guest              │
│  • Toggles darkMode variable            │
│  • Calls applyDarkMode()                │
│  • Calls saveUserData()                 │
└──────┬──────────────────────────────────┘
       │ 4. Apply styles
       │
       ├──> document.body.classList
       │    • Adds/removes 'dark-mode' class
       │
       └──> Firestore
            • Saves darkMode: true/false
            • Syncs across devices
```

## Error Flows

### Payment Error
```
User clicks Upgrade
    ↓
Cloud Function fails
    ↓
Catch error
    ↓
Show error message
    ↓
Re-enable button
    ↓
User can retry
```

### Webhook Error
```
Stripe sends webhook
    ↓
Signature verification fails
    ↓
Return 400 error
    ↓
Stripe retries webhook
    ↓
(Automatic retry with backoff)
```

### Dark Mode Error (Guest)
```
Guest clicks dark mode toggle
    ↓
Check userTier === 'guest'
    ↓
Show alert
    ↓
Reset checkbox to unchecked
    ↓
No state change
```
