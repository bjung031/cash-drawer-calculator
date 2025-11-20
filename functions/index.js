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

    // Immediately upgrade user to supporter upon successful checkout
    await admin.firestore().collection(USERS_PATH).doc(userId).set(
      {
        tier: "supporter",
        upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log(`User "${userId}" upgraded to "supporter" after checkout completion.`);

    // Fetch subscription info if available for future updates
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
    if (subscriptionStatus === "active" || subscriptionStatus === "trialing") {
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
          tier: "user", // Downgrade to user tier (not guest)
        },
        { merge: true }
      );
      console.log(`User "${userId}" tier downgraded to "user" due to subscription status: ${subscriptionStatus}.`);
    }
  } catch (error) {
    console.error("Failed to handle subscription update:", error.message);
  }
}

// Cloud Function to create a Stripe Checkout Session
exports.createCheckoutSession = onRequest(
  {
    region: "us-central1",
    secrets: ["STRIPE_SECRET_KEY"],
    cors: true, // Enable CORS for frontend calls
  },
  async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }

    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    try {
      const { userId, email } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }

      // Initialize Stripe
      const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

      // Create Checkout Session
      const session = await stripeClient.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: "price_1QY8XzIBG9c10siBCf2aZITZ", // Replace with your Stripe Price ID
            quantity: 1,
          },
        ],
        client_reference_id: userId,
        customer_email: email,
        success_url: "https://drawercheckout.com/success.html",
        cancel_url: "https://drawercheckout.com/",
      });

      console.log(`Checkout session created for user ${userId}: ${session.id}`);
      res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

// Set global options for Firebase functions (optimize cold starts)
setGlobalOptions({ maxInstances: 10 });