/* ==============================================================
   auth.js – Firebase Auth + Firestore + Tier handling
   ============================================================== */

const firebaseConfig = {
    apiKey: "AIzaSyAE927S2cTKDQE0orVSio4P6FrhYukDo0I",
    authDomain: "backend-c191a.firebaseapp.com",
    projectId: "backend-c191a",
    storageBucket: "backend-c191a.firebasestorage.app",
    messagingSenderId: "646996514675",
    appId: "1:646996514675:web:c0024ca6939a4356719706",
    measurementId: "G-M7WKXT7J7F"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
const functions = firebase.functions();

/* --------------------------------------------------------------
   Global state – main.js will read these
   -------------------------------------------------------------- */
let currentUser   = null;
let isAuthenticated = false;
let dataLoaded    = false;
window.authDataReady = false; // ← NEW
let userTier      = 'guest';      // guest | user | supporter
let maxDrawers    = 1;            // default
let darkMode = false;

function applyDarkMode() {
    document.body.classList.toggle('dark-mode', darkMode);
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) toggle.checked = darkMode;
}
window.applyDarkMode = applyDarkMode; // Expose globally
window.toggleDarkMode = () => {
    if (window.userTier === 'guest') {
        alert('Dark mode is for logged-in users only.');
        return;
    }
    darkMode = !darkMode;
    applyDarkMode();
    if (window.saveUserData) window.saveUserData();
};

/* --------------------------------------------------------------
   Default drawer template (1-10)
   -------------------------------------------------------------- */
const defaultDrawers = {
    1: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, useRolls: false, checkoutTarget: 100.00 },
    2: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, useRolls: false, checkoutTarget: 100.00 },
    3: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, useRolls: false, checkoutTarget: 100.00 },
    4: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, useRolls: false, checkoutTarget: 100.00 },
    5: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, useRolls: false, checkoutTarget: 100.00 },
    6: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, useRolls: false, checkoutTarget: 100.00 },
    7: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, useRolls: false, checkoutTarget: 100.00 },
    8: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, useRolls: false, checkoutTarget: 100.00 },
    9: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, useRolls: false, checkoutTarget: 100.00 },
    10:{ values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, useRolls: false, checkoutTarget: 100.00 }
};

/* --------------------------------------------------------------
   Auth state listener – runs on every page load / login / logout
   -------------------------------------------------------------- */
   
   
/* ----- COMPLETE onAuthStateChanged ----- */
auth.onAuthStateChanged(async firebaseUser => {
    currentUser = firebaseUser;
    isAuthenticated = !!firebaseUser;
    dataLoaded = false;

    // Update auth link text & behavior
    const authLink = document.getElementById('authLink');
    if (firebaseUser) {
        /* ----- LOGGED IN ----- */
        if (authLink) {
            authLink.innerText = 'Logout';
            authLink.onclick = (e) => {
                e.preventDefault();
                logout();
                document.getElementById('menuDropdown')?.classList.remove('open');
            };
        }
        document.getElementById('userStatus').innerText = `Logged in as ${firebaseUser.displayName || 'User'}`;
        document.getElementById('deleteAccountSection').style.display = 'block';
        document.getElementById('settingsSection').style.display = 'block';

        // Clear local data, load from Firestore
        localStorage.removeItem('cashDrawerData');

        // NEW: Force refresh token to get latest custom claims from Stripe extension
        await firebaseUser.getIdToken(true);
        const idTokenResult = await firebaseUser.getIdTokenResult();
        const stripeRole = idTokenResult.claims.stripeRole;

        // Set tier based on Stripe custom claim
        if (stripeRole === 'supporter') {
            userTier = 'supporter';
            window.userTier = 'supporter';
        } else {
            userTier = 'user';
            window.userTier = 'user';
        }

        // Load user data (drawers, dark mode, etc.)
        await loadUserData();

        // Optional: Real-time listener for future subscription changes
        // (in case user upgrades/downgrades while app is open)
        setupSubscriptionListener(firebaseUser.uid);

    } else {
        /* ----- GUEST ----- */
        if (authLink) {
            authLink.innerText = 'Login/Signup';
            authLink.onclick = (e) => {
                e.preventDefault();
                showScreen('loginScreen');
                document.getElementById('menuDropdown')?.classList.remove('open');
            };
        }
        document.getElementById('userStatus').innerText = 'Logged in as Guest';
        document.getElementById('deleteAccountSection').style.display = 'none';
        document.getElementById('settingsSection').style.display = 'none';

        userTier = 'guest';
        window.userTier = 'guest';
        maxDrawers = 1;
        await loadLocalData();
    }

    window.authDataReady = true;
});

/* --------------------------------------------------------------
   Real-time listener for subscription changes (optional but recommended)
   -------------------------------------------------------------- */
function setupSubscriptionListener(uid) {
    // Remove previous listener if exists
    if (window.subscriptionUnsubscribe) {
        window.subscriptionUnsubscribe();
    }

    window.subscriptionUnsubscribe = db.collection('customers')
        .doc(uid)
        .collection('subscriptions')
        .where('status', 'in', ['active', 'trialing'])
        .onSnapshot(snapshot => {
            const hasActiveSub = !snapshot.empty;

            if (hasActiveSub && userTier !== 'supporter') {
                // Upgrade to supporter
                userTier = 'supporter';
                window.userTier = 'supporter';
                updateMaxDrawers();
                alert('Upgrade successful! You now have 10 drawers and no ads.');
                loadUserData(); // Reload drawers with new limit
            } else if (!hasActiveSub && userTier === 'supporter') {
                // Downgrade (subscription canceled)
                userTier = 'user';
                window.userTier = 'user';
                updateMaxDrawers();
                alert('Your Supporter subscription has ended. You now have 3 drawers.');
                loadUserData();
            }
        });
}

/* --------------------------------------------------------------
   LOGIN (email or username)
   -------------------------------------------------------------- */
function login() {
    const usernameOrEmail = document.getElementById('loginUsernameOrEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    errorDiv.innerHTML = '';

    if (!usernameOrEmail || !password) {
        errorDiv.innerHTML = 'Please enter both username/email and password.';
        return;
    }

    const isEmail = usernameOrEmail.includes('@');
    if (isEmail) {
        auth.signInWithEmailAndPassword(usernameOrEmail, password)
            .then(() => showScreen('inputScreen'))
            .catch(err => errorDiv.innerHTML = err.message);
    } else {
        // username → look up email
        const usernameLower = usernameOrEmail.toLowerCase();
		db.collection('usernames').doc(usernameLower).get()
            .then(doc => {
                if (!doc.exists) {
                    errorDiv.innerHTML = 'Username not found.';
                    return;
                }
                const email = doc.data().email;
                auth.signInWithEmailAndPassword(email, password)
                    .then(() => showScreen('inputScreen'))
                    .catch(err => errorDiv.innerHTML = err.message);
            })
            .catch(err => errorDiv.innerHTML = 'Error accessing username: ' + err.message);
    }
}

// ——————— TIER DEFINITIONS ———————
function getMaxDrawers(tier) {
    if (tier === 'supporter') return 10;
    if (tier === 'user') return 3;
    return 1; // guest
}

// Use this everywhere instead of hardcoding
function updateMaxDrawers() {
    maxDrawers = getMaxDrawers(userTier);
}

/* --------------------------------------------------------------
   SIGNUP
   -------------------------------------------------------------- */
function signup() {
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const errorDiv = document.getElementById('loginError');
    errorDiv.innerHTML = '';
    if (!username) { errorDiv.innerHTML = 'Username is required.'; return; }

    const usernameLower = username.toLowerCase();  // ← LOWERCASE KEY

    db.collection('usernames').doc(usernameLower).get()
        .then(doc => {
            if (doc.exists) {
                errorDiv.innerHTML = 'Username already taken.';
                return;
            }
            return auth.createUserWithEmailAndPassword(email, password);
        })
        .then(userCredential => {
            const user = userCredential.user;
            const initData = {
                drawers: JSON.parse(JSON.stringify(defaultDrawers)),
                darkMode: false,
                tier: 'user'
            };

            return Promise.all([
                user.updateProfile({ displayName: username }),
                db.collection('usernames').doc(usernameLower).set({
                    uid: user.uid,
                    email,
                    displayName: username
                }),
                db.collection('users').doc(user.uid).set(initData)
            ]);
        })
        .then(() => auth.currentUser.reload())
        .then(() => {
            showScreen('inputScreen');
        })
        .catch(err => errorDiv.innerHTML = err.message);
}

/* --------------------------------------------------------------
   LOGOUT
   -------------------------------------------------------------- */
function logout() {
    auth.signOut().then(() => {
        isAuthenticated = false;
        currentUser = null;
        userTier = 'guest';  // ← GUEST = 1 drawer
		window.userTier = 'guest';
        updateMaxDrawers();  // ← maxDrawers = 1

        // Reset drawers to 1 only
        drawers = {
            1: JSON.parse(JSON.stringify(defaultDrawers[1]))
        };
        if (currentDrawer > 1) {
            currentDrawer = 1;
        }
        darkMode = false;

        localStorage.removeItem('cashDrawerData');
        loadLocalData(); // will load only 1 drawer
        showScreen('inputScreen');
        updateDrawerDisplay();
        applyDarkMode();
        updateAccountStatus();

        console.log('Logged out → Guest mode (1 drawer)');
    }).catch(err => console.error('Logout failed:', err));
}

/* --------------------------------------------------------------
   DELETE ACCOUNT
   -------------------------------------------------------------- */
function deleteAccount() {
    if (!currentUser || !isAuthenticated) {
        document.getElementById('error').innerHTML = 'No user is currently logged in.';
        return;
    }
    if (!confirm('Are you sure you want to delete your account? This will permanently remove all your data, including drawer information, and cannot be undone.')) {
        return;
    }

    const uid = currentUser.uid;
    const username = currentUser.displayName;
    const usernameLower = username ? username.toLowerCase() : null;

    if (!usernameLower) {
        alert('Error: Username not found.');
        return;
    }

    Promise.all([
        db.collection('users').doc(uid).delete(),
        db.collection('usernames').doc(usernameLower).delete(),
        currentUser.delete()
    ])
    .then(() => {
        isAuthenticated = false;
        dataLoaded = false;
        userTier = 'guest';
        window.userTier = 'guest';
        maxDrawers = 1;
        loadLocalData();
        showScreen('inputScreen');
        updateDrawerDisplay();
        updateAccountStatus();
    })
    .catch(err => {
        console.error('Error deleting account:', err);
        document.getElementById('error').innerHTML = 'Failed to delete account: ' + err.message;
    });
}


function handleAuthClick(e) {
    e.preventDefault();
    if (document.getElementById('authLink').innerText.includes('Logout')) {
        logout();
    } else {
        showScreen('loginScreen');
    }
	closeMenu();
}
/* --------------------------------------------------------------
   SAVE USER DATA (called from main.js)
   -------------------------------------------------------------- */
function saveUserData() {
	console.log('Saved to cloud');
    const payload = {
        drawers: JSON.parse(JSON.stringify(drawers)),
        darkMode,
        tier: userTier
    };

    console.log('saveUserData() called', payload);

    // LocalStorage
    try {
        localStorage.setItem('cashDrawerData', JSON.stringify(payload));
        console.log('Saved to localStorage');
    } catch (e) { console.error('localStorage failed:', e); }

    // Firestore
    if (!currentUser || !isAuthenticated) {
        console.log('Not logged in → skipping Firestore');
        return;
    }

    const userDoc = db.collection('users').doc(currentUser.uid);
    userDoc.set(payload, { merge: true })
        .then(() => {
            console.log('Firestore write SUCCESS');
            const status = document.getElementById('saveStatus');
            if (status) {
                status.textContent = 'Saved to cloud';
                status.style.opacity = '1';
                setTimeout(() => status.style.opacity = '0', 800);
            }
        })
        .catch(err => {
            console.error('Firestore write FAILED:', err);
            const errorDiv = document.getElementById('error');
            if (errorDiv) errorDiv.innerHTML = `Save failed: ${err.message}`;
        });
}

/* --------------------------------------------------------------
   LOAD FROM FIRESTORE (logged-in users)
   -------------------------------------------------------------- */
async function loadUserData() {
    if (!currentUser || !isAuthenticated) return loadLocalData();

    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        let data = {};

        if (doc.exists) {
            data = doc.data();
        } else {
            // First-time user → create defaults
            data = {
                drawers: JSON.parse(JSON.stringify(defaultDrawers)),
                darkMode: false,
                tier: 'user'
            };
            await db.collection('users').doc(currentUser.uid).set(data);
        }

        // ——— TIER ENFORCEMENT ———
        userTier = data.tier || 'user';
		window.userTier = userTier;
        updateMaxDrawers();  // 1, 3, or 10

        // Limit drawers to tier
        const limitedDrawers = {};
        for (let i = 1; i <= maxDrawers; i++) {
            const saved = data.drawers?.[i];
            const def = defaultDrawers[i] || defaultDrawers[1];  // fallback
            limitedDrawers[i] = saved 
                ? {
                    values: { ...def.values, ...(saved.values || {}) },
                    total: saved.total ?? 0,
                    target: saved.target ?? 100.00,
                    useRolls: saved.useRolls ?? false,
                    checkoutTarget: saved.checkoutTarget ?? 100.00
                  }
                : JSON.parse(JSON.stringify(def));
        }
        drawers = limitedDrawers;

        darkMode = data.darkMode ?? false;

        // ——— UI & SAVE ———
        dataLoaded = true;
        applyDarkMode();
        updateDrawerDisplay();
        updateAccountStatus();
        document.getElementById('darkModeToggle').checked = darkMode;

        // Sync any local edits
        saveUserData();

    } catch (err) {
        console.error('Firestore load error:', err);
        document.getElementById('error').innerHTML = 'Using local data (cloud failed).';
        await loadLocalData();
    }

    window.authDataReady = true;
    console.log('loadUserData: Tier loaded →', userTier, maxDrawers, 'drawers');
}

/* --------------------------------------------------------------
   LOAD FROM LOCALSTORAGE (guests or offline)
   -------------------------------------------------------------- */
async function loadLocalData() {
    const saved = localStorage.getItem('cashDrawerData');
    
    // ——— GUEST: ALWAYS 1 DRAWER ———
    userTier = 'guest';
	window.userTier = 'guest';
    maxDrawers = 1;  // ← GUEST = 1 DRAWER ONLY

    const limitedDrawers = {};

    if (saved) {
        try {
            const data = JSON.parse(saved);

            // Only load drawer 1
            const savedDrawer = data.drawers?.[1];
            const def = defaultDrawers[1];

            limitedDrawers[1] = savedDrawer
                ? {
                    values: { ...def.values, ...(savedDrawer.values || {}) },
                    total: savedDrawer.total ?? 0,
                    target: savedDrawer.target ?? 100.00,
                    useRolls: savedDrawer.useRolls ?? false,
                    checkoutTarget: savedDrawer.checkoutTarget ?? 100.00
                  }
                : JSON.parse(JSON.stringify(def));

            darkMode = false;

        } catch (e) {
            console.error('Local data parse failed:', e);
            // Fall back to fresh
        }
    }

    // Fresh guest defaults
    if (!limitedDrawers[1]) {
        limitedDrawers[1] = JSON.parse(JSON.stringify(defaultDrawers[1]));
        darkMode = false;
    }

    drawers = limitedDrawers;

    // ——— UI ———
    dataLoaded = true;
    applyDarkMode();
    updateDrawerDisplay();
    updateAccountStatus();
    document.getElementById('darkModeToggle').checked = darkMode;

    window.authDataReady = true;
    console.log('loadLocalData: Guest mode → 1 drawer');
}

/* --------------------------------------------------------------
   MERGE SAVED DRAWERS WITH DEFAULT TEMPLATE
   -------------------------------------------------------------- */
function mergeDrawers(saved) {
    const merged = JSON.parse(JSON.stringify(defaultDrawers));
    for (const id in saved) {
        const numId = parseInt(id);
        if (merged[numId]) {
            merged[numId] = {
                values: { ...merged[numId].values, ...(saved[id].values || {}) },
                total: saved[id].total !== undefined ? saved[id].total : merged[numId].total,
                target: saved[id].target !== undefined ? saved[id].target : merged[numId].target,
                useRolls: saved[id].useRolls !== undefined ? saved[id].useRolls : merged[numId].useRolls,
                checkoutTarget: saved[id].checkoutTarget !== undefined ? saved[id].checkoutTarget : merged[numId].checkoutTarget
            };
        }
    }
    return merged;
}

/* --------------------------------------------------------------
   ACCOUNT STATUS UI
   -------------------------------------------------------------- */
function updateAccountStatus() {
    const msg = document.getElementById('statusMessage');
    if (isAuthenticated && currentUser) {
        const tierName = userTier === 'supporter' ? 'Supporter' : 'User';
        const originalUsername = currentUser.displayName || 'User';

        msg.innerHTML = `
            <strong>Username:</strong> ${originalUsername}<br>
            <strong>Email:</strong> ${currentUser.email || 'N/A'}<br>
            <strong>Tier:</strong> ${tierName} (max ${maxDrawers} drawers)
        `;
    } else {
        msg.innerHTML = `
            <strong>Account:</strong> Guest (1 drawer)<br>
            <a href="#" onclick="showScreen('loginScreen')">Log in / Sign up</a> for cloud sync and up to 3 drawers.
        `;
    }
}
/* --------------------------------------------------------------
   UPGRADE TO SUPPORTER (manual – replace with real verification later)
   -------------------------------------------------------------- */
async function upgradeToSupporter() {
    if (!currentUser) return alert('Log in first.');
    const email = prompt('Enter your email:');
    if (!email) return;

    try {
        await db.collection('users').doc(currentUser.uid).update({ tier: 'supporter' });
        alert('Upgraded to Supporter! Refresh the page to see 10 drawers.');
    } catch (e) {
        alert('Upgrade failed: ' + e.message);
    }
}

/* --------------------------------------------------------------
   EXPORT GLOBALS FOR main.js
   -------------------------------------------------------------- */
window.saveUserData      = saveUserData;
// GOOD — only pass what exists
window.getCurrentUser = (cb) => {
    if (currentUser) {
        cb({
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            email: currentUser.email,
            tier: userTier  // ← comes from Firestore load
        });
    } else {
        cb(null);
    }
};
window.maxDrawers        = () => maxDrawers;            // read-only accessor
window.upgradeToSupporter = upgradeToSupporter;
window.userTier = userTier;

/* --------------------------------------------------------------
   Dropdown menu – Login / Logout link
   -------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    const authLink = document.getElementById('authLink');
    authLink.addEventListener('click', e => {
        e.preventDefault();
        if (authLink.innerText.includes('Logout')) logout();
        else showScreen('loginScreen');
    });
});

window.authDataReady = false;
console.log('saveUserData exposed to window');
// Set to true after loadUserData() or loadLocalData() finishes
// (You already do this — just confirm it's there)