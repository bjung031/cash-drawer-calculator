// functions/index.js
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

// 1. Initialise Firebase Admin (required for Firestore)
admin.initializeApp();

// 2. **Stripe is created inside the handler** – the secret is guaranteed to exist
//    (process.env.STRIPE_SECRET_KEY is injected by the `secrets` field)
exports.stripeWebhook = onRequest(
  {
    region: "us-central1",
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  },
  async (req, res) => {
    // ---- Create Stripe client *after* secrets are available ----
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET missing");
      return res.status(500).send("Server mis-configured");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
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
    res.json({ received: true });
  }
);

// Optional: limit max instances (helps with cold starts)
setGlobalOptions({ maxInstances: 10 });