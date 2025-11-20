# Testing Guide

This guide provides step-by-step instructions for testing the dark mode and Stripe API changes.

## Prerequisites

Before testing, ensure you have:
1. Deployed the Cloud Functions
2. Configured Stripe secrets
3. Set up the Stripe webhook
4. Deployed the frontend

## Test 1: Dark Mode Toggle

### Test 1.1: Guest User (Should be disabled)
1. Open the app without logging in
2. Click Menu → Account
3. Verify that the "Enable Dark Mode" checkbox is **disabled**
4. Try to click it - nothing should happen
5. ✅ **Expected:** Dark mode is not available for guest users

### Test 1.2: Logged-in User (Should work)
1. Log in with a user account
2. Click Menu → Account
3. Verify that the "Enable Dark Mode" checkbox is **enabled**
4. Check the checkbox
5. ✅ **Expected:** 
   - Background changes to dark (#121212)
   - Text changes to white
   - Inputs and buttons have dark styling
   - Setting is saved to Firestore
6. Uncheck the checkbox
7. ✅ **Expected:** Dark mode is disabled, colors revert to light theme
8. Reload the page
9. ✅ **Expected:** Dark mode setting persists (stays on if it was on)

### Test 1.3: Dark Mode Persistence
1. Enable dark mode
2. Navigate to Calculator page
3. ✅ **Expected:** Dark mode is still active
4. Logout
5. ✅ **Expected:** Dark mode is disabled (guest mode)
6. Log back in
7. ✅ **Expected:** Dark mode is restored to previous state

## Test 2: Stripe Checkout (Test Mode)

### Test 2.1: Create Checkout Session
1. Log in with a user account (not supporter)
2. Click Menu → Account
3. Scroll to "Supporter Account" section
4. Click "Upgrade to Supporter"
5. ✅ **Expected:**
   - Button shows "Creating checkout session..."
   - Button is disabled during creation
   - You are redirected to Stripe Checkout page
6. ✅ **Verify in browser console:**
   - No JavaScript errors
   - Cloud Function is called successfully

### Test 2.2: Cancel Checkout
1. On the Stripe Checkout page, click the back arrow (← Cancel)
2. ✅ **Expected:** You are redirected back to homepage (drawercheckout.com)
3. Click Menu → Account
4. ✅ **Expected:** You are still "User" tier (not upgraded)

### Test 2.3: Complete Checkout (Test Mode)
1. Start the checkout flow again
2. On the Stripe Checkout page, enter test card details:
   - **Card number:** 4242 4242 4242 4242
   - **Expiry:** Any future date (e.g., 12/25)
   - **CVC:** Any 3 digits (e.g., 123)
   - **Name:** Any name
   - **Email:** Your account email
3. Click "Subscribe"
4. ✅ **Expected:** You are redirected to success.html
5. ✅ **Verify on success.html:**
   - Shows "Thank You! You're now a Supporter!"
   - Shows spinner animation
   - Shows "Redirecting you back in 3 seconds..."
6. Wait for redirect
7. ✅ **Expected:** 
   - Redirected to homepage
   - Alert shows "Upgrade successful! You are now a Supporter."
8. Click Menu → Account
9. ✅ **Expected:** 
   - Your tier shows "Supporter (max 10 drawers)"
10. Navigate to Calculator
11. Click "Next" button repeatedly
12. ✅ **Expected:** You can access Drawers 1-10

### Test 2.4: Verify Firestore Updates
1. Open Firebase Console → Firestore
2. Navigate to `users` collection → your user ID
3. ✅ **Verify:**
   - `tier` field is "supporter"
   - `upgradedAt` field has a timestamp
4. Navigate to `customers` collection → your user ID
5. ✅ **Verify:**
   - `customer_id` field has Stripe customer ID (cus_...)

### Test 2.5: Verify Stripe Dashboard
1. Open Stripe Dashboard → Customers
2. Find your customer by email
3. ✅ **Verify:**
   - Customer exists with correct email
   - Has an active subscription
   - Subscription has the correct price/plan

## Test 3: Webhook Events

### Test 3.1: Subscription Created
This happens automatically when you complete checkout in Test 2.3.
✅ **Verify:** User tier is "supporter" after successful payment

### Test 3.2: Subscription Canceled (Manual Test)
1. In Stripe Dashboard, find your subscription
2. Cancel the subscription
3. Wait a few seconds for webhook to process
4. Refresh the app and click Menu → Account
5. ✅ **Expected:** Your tier is downgraded to "User" (max 3 drawers)

### Test 3.3: Subscription Reactivated
1. In Stripe Dashboard, reactivate the subscription
2. Wait a few seconds for webhook to process
3. Refresh the app and click Menu → Account
4. ✅ **Expected:** Your tier is upgraded back to "Supporter" (max 10 drawers)

## Test 4: Error Handling

### Test 4.1: Network Error
1. Open browser DevTools → Network tab
2. Set throttling to "Offline"
3. Try to upgrade to supporter
4. ✅ **Expected:** 
   - Error message: "Failed to create checkout session. Please try again."
   - Button is re-enabled

### Test 4.2: Missing User ID
This is an edge case that shouldn't happen in normal use, but the code handles it.

### Test 4.3: Invalid Stripe Key
This should be caught during deployment/configuration phase.

## Test 5: Multi-Device Sync

### Test 5.1: Dark Mode Sync
1. Enable dark mode on Device A
2. Log in to the same account on Device B
3. ✅ **Expected:** Dark mode is enabled on Device B
4. Disable dark mode on Device B
5. Refresh Device A
6. ✅ **Expected:** Dark mode is disabled on Device A

### Test 5.2: Supporter Tier Sync
1. Upgrade to supporter on Device A
2. Log in to the same account on Device B
3. ✅ **Expected:** Device B shows supporter tier and 10 drawers
4. Add data to Drawer 8 on Device B
5. Refresh Device A and navigate to Drawer 8
6. ✅ **Expected:** Device A shows the data from Device B

## Debugging

If tests fail, check:

1. **Cloud Function Logs:**
   ```bash
   firebase functions:log
   ```

2. **Browser Console:**
   - Open DevTools → Console
   - Look for errors or warnings

3. **Firestore Rules:**
   - Ensure users can read/write their own data

4. **Stripe Webhook Logs:**
   - Go to Stripe Dashboard → Developers → Webhooks
   - Click on your webhook
   - Check the "Events" tab for successful/failed events

5. **Network Tab:**
   - Open DevTools → Network
   - Look for failed requests
   - Check request/response payloads

## Test Results Template

Use this template to document your test results:

```
Test Date: [DATE]
Tester: [NAME]

Dark Mode Tests:
[ ] Test 1.1: Guest user - dark mode disabled
[ ] Test 1.2: Logged-in user - dark mode works
[ ] Test 1.3: Dark mode persists across sessions

Stripe Checkout Tests:
[ ] Test 2.1: Create checkout session
[ ] Test 2.2: Cancel checkout
[ ] Test 2.3: Complete checkout
[ ] Test 2.4: Firestore updates
[ ] Test 2.5: Stripe dashboard verification

Webhook Tests:
[ ] Test 3.1: Subscription created
[ ] Test 3.2: Subscription canceled
[ ] Test 3.3: Subscription reactivated

Error Handling:
[ ] Test 4.1: Network error

Multi-Device Sync:
[ ] Test 5.1: Dark mode sync
[ ] Test 5.2: Supporter tier sync

Issues Found: [DESCRIBE ANY ISSUES]
Notes: [ANY ADDITIONAL NOTES]
```
