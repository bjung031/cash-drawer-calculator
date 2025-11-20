const { onRequest } = require("firebase-functions/v2/https");
const { firestore } = require("firebase-functions");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const stripe = require("stripe"); // Import Stripe dynamically later

// Initialize Firebase Admin SDK
admin.initializeApp();

// Firestore collection paths
const CUSTOMERS_PATH = "/customers";
const USERS_PATH = "/users";

// Automatically triggered Firebase Function for Stripe Webhooks
exports.stripeWebhook = onRequest(
  {
    region: "us-central1",
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    rawBody: true, // Ensures raw body is preserved for Stripe signature verification
  },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    // Import Stripe library dynamically in handler
    const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      console.error("Missing stripe-signature header.");
      return res.status(400).send("Missing stripe-signature header");
    }

    let event;
    try {
      // Verify Stripe signature and construct event
      event = stripeClient.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
      console.log(`Webhook event received: ${event.type}`);
    } catch (error) {
      console.error("Stripe webhook signature verification failed:", error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    const eventData = event.data.object;

    // Handle different Stripe event types
    switch (event.type) {
      case "checkout.session.completed":
        // Triggered on checkout completion
        await handleCheckoutCompletion(eventData, stripeClient);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.created":
      case "customer.subscription.deleted":
        // Triggered when a subscription is updated, created, or deleted
        await handleSubscriptionUpdate(eventData);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
);

// Function to handle `checkout.session.completed`
async function handleCheckoutCompletion(session, stripeClient) {
  const userId = session.client_reference_id; // Pass this during Checkout Session creation
  if (!userId) {
    console.error("Missing client_reference_id in session:", session.id);
    return;
  }

  try {
    // Save Stripe customer ID under the corresponding Firebase user
    await admin.firestore().collection(CUSTOMERS_PATH).doc(userId).set(
      {
        customer_id: session.customer,
      },
      { merge: true } // Merge with existing data
    );
    console.log(`Linked Stripe customer to Firebase user "${userId}": ${session.customer}`);

    // Fetch subscription info if available
    if (session.subscription) {
      const subscription = await stripeClient.subscriptions.retrieve(session.subscription);
      await handleSubscriptionUpdate(subscription);
    }
  } catch (error) {
    console.error("Failed to handle checkout completion:", error.message);
  }
}

// Function to handle subscription updates
async function handleSubscriptionUpdate(subscription) {
  const stripeCustomerId = subscription.customer;
  const subscriptionStatus = subscription.status;

  try {
    // Find the corresponding Firebase user from the `customers` collection
    const customersSnapshot = await admin.firestore()
      .collection(CUSTOMERS_PATH)
      .where("customer_id", "==", stripeCustomerId)
      .limit(1)
      .get();

    if (customersSnapshot.empty) {
      console.error("No matching Firebase user for Stripe customer:", stripeCustomerId);
      return;
    }

    const userId = customersSnapshot.docs[0].id; // Firebase user ID

    // Update the user's tier in the `users` collection based on subscription status
    if (subscriptionStatus === "active") {
      await admin.firestore().collection(USERS_PATH).doc(userId).set(
        {
          tier: "supporter", // Upgrade user's tier
          upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true } // Merge with existing data
      );
      console.log(`User "${userId}" upgraded to "supporter" due to active subscription.`);
    } else {
      // Downgrade user if subscription is canceled or not active
      await admin.firestore().collection(USERS_PATH).doc(userId).set(
        {
          tier: "guest", // Downgrade to guest or base tier
        },
        { merge: true }
      );
      console.log(`User "${userId}" tier downgraded due to subscription status: ${subscriptionStatus}.`);
    }
  } catch (error) {
    console.error("Failed to handle subscription update:", error.message);
  }
}

// Set global options for Firebase functions (optimize cold starts)
setGlobalOptions({ maxInstances: 10 });