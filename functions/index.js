const { onRequest, onCall } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const stripe = require('stripe');

// Initialize Firebase Admin
admin.initializeApp();

// Define secrets
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const stripePriceId = defineSecret('STRIPE_PRICE_ID');

// Allowed origins for CORS
const allowedOrigins = [
    'https://drawercheckout.com',
    'https://www.drawercheckout.com',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'https://backend-c191a.web.app',
    'https://backend-c191a.firebaseapp.com'
];

/**
 * CORS middleware helper for onRequest functions
 */
function handleCors(req, res) {
    const origin = req.headers.origin;
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, stripe-signature');
    res.set('Access-Control-Max-Age', '3600');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return true;
    }
    
    return false;
}

/**
 * Create Stripe Checkout Session
 * This is a callable function that works with firebase.functions().httpsCallable()
 * Body: { userId, email }
 */
exports.createCheckoutSession = onCall(
    { 
        secrets: [stripeSecretKey, stripePriceId],
        cors: allowedOrigins
    },
    async (request) => {
        try {
            const { userId, email } = request.data;
            
            // Validate input
            if (!userId || !email) {
                throw new Error('Missing userId or email');
            }
            
            // Initialize Stripe
            const stripeClient = stripe(stripeSecretKey.value());
            const db = admin.firestore();
            
            // Check if customer document already exists in Firestore
            const customerDocRef = db.collection('customers').doc(userId);
            const customerDoc = await customerDocRef.get();
            
            let customerId;
            
            if (customerDoc.exists && customerDoc.data().stripeId) {
                // Use existing Stripe customer ID
                customerId = customerDoc.data().stripeId;
                console.log(`Using existing Stripe customer ${customerId} for user ${userId}`);
            } else {
                // Create new Stripe customer
                console.log(`Creating new Stripe customer for user ${userId}`);
                try {
                    const customer = await stripeClient.customers.create({
                        email: email,
                        metadata: {
                            firebaseUID: userId,
                            userId: userId,
                        },
                    });
                    customerId = customer.id;
                    
                    // Store customer in Firestore customers/{userId} collection
                    await customerDocRef.set({
                        stripeId: customerId,
                        email: email,
                        created: admin.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });
                    
                    console.log(`Created Stripe customer ${customerId} and stored in Firestore for user ${userId}`);
                } catch (customerError) {
                    console.error('Error creating customer:', customerError);
                    const errorMessage = customerError?.message || customerError || 'Unknown error';
                    throw new Error(`Failed to create Stripe customer: ${errorMessage}`);
                }
            }
            
            // Metadata for both extension and custom handlers
            // - firebaseUID: Required by Stripe Firebase Extension
            // - userId: Used by custom webhook handlers for backward compatibility
            const metadata = {
                userId: userId,
                firebaseUID: userId,
            };
            
            // Create Checkout Session with customer ID
            const session = await stripeClient.checkout.sessions.create({
                mode: 'subscription',
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: stripePriceId.value(),
                        quantity: 1,
                    },
                ],
                customer: customerId,
                client_reference_id: userId,
                metadata: metadata,
                subscription_data: {
                    metadata: metadata,
                },
                success_url: 'https://www.drawercheckout.com/success.html',
                cancel_url: 'https://www.drawercheckout.com/',
            });
            
            console.log(`Created checkout session ${session.id} for user ${userId}`);
            
            // Return session info (onCall automatically wraps this in data field)
            return {
                sessionId: session.id,
                url: session.url,
            };
        } catch (error) {
            console.error('Error creating checkout session:', error);
            throw new Error(error.message || 'Failed to create checkout session');
        }
    }
);

/**
 * Stripe Webhook Handler
 * Endpoint: POST /stripeWebhook
 * Handles: checkout.session.completed, customer.subscription.*
 */
exports.stripeWebhook = onRequest(
    { 
        secrets: [stripeSecretKey, stripeWebhookSecret],
        rawBody: true
    },
    async (req, res) => {
        // Handle CORS
        if (handleCors(req, res)) {
            return;
        }
        
        // Only allow POST
        if (req.method !== 'POST') {
            res.status(405).send('Method not allowed');
            return;
        }
        
        const sig = req.headers['stripe-signature'];
        let event;
        
        try {
            // Initialize Stripe
            const stripeClient = stripe(stripeSecretKey.value());
            
            // Verify webhook signature
            event = stripeClient.webhooks.constructEvent(
                req.rawBody,
                sig,
                stripeWebhookSecret.value()
            );
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }
        
        // Handle the event
        try {
            switch (event.type) {
                case 'checkout.session.completed':
                    await handleCheckoutCompleted(event.data.object);
                    break;
                    
                case 'customer.subscription.created':
                    await handleSubscriptionCreated(event.data.object);
                    break;
                    
                case 'customer.subscription.updated':
                    await handleSubscriptionUpdated(event.data.object);
                    break;
                    
                case 'customer.subscription.deleted':
                    await handleSubscriptionDeleted(event.data.object);
                    break;
                    
                default:
                    console.log(`Unhandled event type: ${event.type}`);
            }
            
            res.status(200).json({ received: true });
        } catch (error) {
            console.error('Error handling webhook event:', error);
            res.status(500).json({ error: 'Webhook handler failed' });
        }
    }
);



/**
 * Helper function to determine tier based on subscription status
 */
function getTierFromStatus(status) {
    return (status === 'active' || status === 'trialing') ? 'supporter' : 'user';
}

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutCompleted(session) {
    console.log('Checkout completed:', session.id);
    
    const userId = session.client_reference_id || session.metadata?.firebaseUID || session.metadata?.userId;
    const customerId = session.customer;
    
    if (!userId) {
        console.error('No userId found in checkout session');
        return;
    }
    
    const db = admin.firestore();
    
    // Update user tier to supporter
    await db.collection('users').doc(userId).set(
        {
            tier: 'supporter',
            stripeCustomerId: customerId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
    
    console.log(`User ${userId} upgraded to supporter`);
}

/**
 * Handle customer.subscription.created event
 */
async function handleSubscriptionCreated(subscription) {
    console.log('Subscription created:', subscription.id);
    
    const status = subscription.status;
    const userId = subscription.metadata?.firebaseUID || subscription.metadata?.userId;
    
    if (!userId) {
        console.error(`No userId found in subscription metadata for subscription ${subscription.id}`);
        return;
    }
    
    const tier = getTierFromStatus(status);
    const db = admin.firestore();
    
    // Update user tier
    await db.collection('users').doc(userId).set(
        {
            tier: tier,
            subscriptionStatus: status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
    
    console.log(`Subscription created for user ${userId} with status ${status}`);
}

/**
 * Handle customer.subscription.updated event
 */
async function handleSubscriptionUpdated(subscription) {
    console.log('Subscription updated:', subscription.id);
    
    const status = subscription.status;
    const userId = subscription.metadata?.firebaseUID || subscription.metadata?.userId;
    
    if (!userId) {
        console.error(`No userId found in subscription metadata for subscription ${subscription.id}`);
        return;
    }
    
    const tier = getTierFromStatus(status);
    const db = admin.firestore();
    
    // Update user tier
    await db.collection('users').doc(userId).set(
        {
            tier: tier,
            subscriptionStatus: status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
    
    console.log(`Subscription updated for user ${userId} with status ${status}`);
}

/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionDeleted(subscription) {
    console.log('Subscription deleted:', subscription.id);
    
    const userId = subscription.metadata?.firebaseUID || subscription.metadata?.userId;
    
    if (!userId) {
        console.error(`No userId found in subscription metadata for subscription ${subscription.id}`);
        return;
    }
    
    const db = admin.firestore();
    
    // Downgrade user tier to 'user'
    await db.collection('users').doc(userId).set(
        {
            tier: 'user',
            subscriptionStatus: 'canceled',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
    
    console.log(`User ${userId} downgraded to user tier`);
}