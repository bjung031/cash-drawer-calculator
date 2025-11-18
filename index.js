// functions/index.js
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

// 1. Initialise Firebase Admin (required for Firestore)
admin.initializeApp();

// 2. Stripe is created inside the handler after secrets are available
exports.stripeWebhook = onRequest(
  {
    region: "us-central1",
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  },
  async (req, res) => {
    // Only allow POST
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    // Ensure secrets are present
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeSecretKey || !webhookSecret) {
      console.error("Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
      return res.status(500).send("Server mis-configured");
    }

    // Create Stripe client *after* secrets are available
    const stripe = require("stripe")(stripeSecretKey);

    // Get signature header
    const sig = req.headers["stripe-signature"] || req.get?.("stripe-signature");
    if (!sig) {
      console.error("Missing stripe-signature header");
      return res.status(400).send("Missing stripe-signature header");
    }

    // IMPORTANT: use the raw body for signature verification
    // Firebase functions must be configured to preserve rawBody (firebase.json functions.rawBody: true).
    // req.rawBody should be a Buffer; if it's missing, fail rather than using parsed body.
    const rawBody = req.rawBody;
    if (!rawBody) {
      console.error("req.rawBody is undefined. Ensure firebase.json has functions.rawBody: true");
      return res.status(400).send("Raw body unavailable");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      console.log("Webhook received:", event.type);
    } catch (err) {
      console.error("Signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ---- Handle checkout.session.completed ----
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const uid = session.client_reference_id;

      if (!uid) {
        console.error("Missing client_reference_id");
        return res.status(400).send("Missing UID");
      }

      try {
        await admin
          .firestore()
          .collection("users")
          .doc(uid)
          .set(
            {
              tier: "supporter",
              upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
              stripeCustomerId: session.customer,
              stripeSessionId: session.id,
            },
            { merge: true }
          );

        console.log("User upgraded to supporter:", uid);
        return res.json({ success: true });
      } catch (err) {
        console.error("Firestore write failed:", err);
        return res.status(500).send("Upgrade failed");
      }
    }

    // Acknowledge any other event
    return res.json({ received: true });
  }
);

// Optional: limit max instances (helps with cold starts)
setGlobalOptions({ maxInstances: 10 });