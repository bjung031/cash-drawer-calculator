/* ==============================================================
   main.js – Drawer Logic + Simple Stripe Link Upgrade + Auth Sync
   ============================================================== */
let currentDrawer = 1;
let drawers = {
    1: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, checkoutTarget: 100.00, useRolls: false },
    2: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, checkoutTarget: 100.00, useRolls: false },
    3: { values: { rvq: 10.00, rvd: 5.00, rvn: 2.00, rvp: 0.50 }, total: 0, target: 100.00, checkoutTarget: 100.00, useRolls: false }
};

/* ————————————————————————————————————————
   SAFE SAVE: Waits for auth.js to be ready
   ———————————————————————————————————————— */
function safeSave() {
    if (typeof window.saveUserData !== 'function') {
        console.warn('saveUserData not loaded, retrying...');
        setTimeout(safeSave, 100);
        return;
    }
    if (!window.authDataReady) {
        console.warn('User data not loaded yet, queuing save...');
        setTimeout(safeSave, 100);
        return;
    }
    console.log('Saving to Firestore...');
    window.saveUserData();
}

/* ==================== MENU HANDLING ==================== */
const menuToggle = document.getElementById('menuToggle');
const menuDropdown = document.getElementById('menuDropdown');

function openMenu() {
    menuDropdown.classList.add('open');
    menuToggle.setAttribute('aria-expanded', 'true');
    menuDropdown.setAttribute('aria-hidden', 'false');
}
function closeMenu() {
    menuDropdown.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuDropdown.setAttribute('aria-hidden', 'true');
}
menuToggle?.addEventListener('click', e => {
    e.stopPropagation();
    menuDropdown.classList.contains('open') ? closeMenu() : openMenu();
});
document.addEventListener('click', e => {
    if (!menuToggle?.contains(e.target) && !menuDropdown?.contains(e.target)) closeMenu();
});
window.closeMenu = closeMenu;

/* ==================== UPGRADE PROMPT ==================== */
function showUpgradePrompt() {
    const tier = window.userTier || 'guest';
    let title, message, actionText, action;
    if (tier === 'guest') {
        title = 'Want More Drawers?';
        message = 'Guests are limited to <strong>1 drawer</strong>.<br>Sign up for a free account to get <strong>3 drawers</strong>!';
        actionText = 'Sign Up Now';
        action = () => showScreen('loginScreen');
    } else if (tier === 'user') {
        title = 'Unlock All 10 Drawers';
        message = 'You have <strong>3 drawers</strong>.<br>Upgrade to <strong>Supporter</strong> to get up to <strong>10</strong>!';
        actionText = 'Upgrade to Supporter';
        action = () => document.getElementById('upgradeToSupporterBtn')?.click();
    } else {
        return;
    }
    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;font-family:system-ui;`;
    modal.innerHTML = `
        <div style="background:white;color:#1a1a1a;padding:28px;border-radius:16px;max-width:380px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.2);">
            <h3 style="margin:0 0 16px;font-size:1.4em;">${title}</h3>
            <p style="margin:0 0 24px;line-height:1.5;">${message}</p>
            <button id="upgradeAction" style="background:#007bff;color:white;border:none;padding:12px 24px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;margin:0 8px;">${actionText}</button>
            <button id="upgradeLater" style="background:#f0f0f0;color:#333;border:none;padding:12px 24px;border-radius:8px;font-size:16px;cursor:pointer;margin:0 8px;">Maybe Later</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#upgradeAction').onclick = () => { action(); modal.remove(); };
    modal.querySelector('#upgradeLater').onclick = () => modal.remove();
    setTimeout(() => modal.remove(), 12000);
}

/* ==================== SCREEN NAVIGATION ==================== */
function showScreen(screenId) {
    const screens = ['inputScreen','checkoutScreen','summaryScreen','aboutScreen','loginScreen','accountScreen','privacyScreen'];
    screens.forEach(s => document.getElementById(s).style.display = s===screenId ? 'block' : 'none');
    if (screenId==='checkoutScreen') updateCheckoutDisplay();
    else if (screenId==='summaryScreen') updateSummaryDisplay();
    else if (screenId==='inputScreen') updateDrawerDisplay();
    else if (screenId==='accountScreen') {
        const tier = window.userTier || 'guest';
        const settings = document.getElementById('settingsSection');
        const dark = document.getElementById('darkModeToggle');
        if (tier==='guest') { if(settings) settings.style.display='none'; if(dark) dark.disabled=true; }
        else { if(settings) settings.style.display='block'; if(dark) dark.disabled=false; }
        dark.checked = darkMode;
    }
}

/* ==================== DRAWER SWITCHING ==================== */
function switchDrawer(dir) {
    const max = typeof window.maxDrawers === 'function' ? window.maxDrawers() : 1;
    const target = currentDrawer + dir;
    if (target > max) { showUpgradePrompt(); return; }
    if (target < 1) return;
    currentDrawer = target;
    updateDrawerDisplay();
    safeSave();
}

/* ==================== CALCULATIONS ==================== */
function calculateTotal() {
    const inputs = {
        b100: parseFloat(document.getElementById('b100').value)||0,
        b50:  parseFloat(document.getElementById('b50').value)||0,
        b20:  parseFloat(document.getElementById('b20').value)||0,
        b10:  parseFloat(document.getElementById('b10').value)||0,
        b5:   parseFloat(document.getElementById('b5').value)||0,
        b2:   parseFloat(document.getElementById('b2').value)||0,
        b1:   parseFloat(document.getElementById('b1').value)||0,
        c100: parseFloat(document.getElementById('c100').value)||0,
        c050: parseFloat(document.getElementById('c050').value)||0,
        c025: parseFloat(document.getElementById('c025').value)||0,
        c010: parseFloat(document.getElementById('c010').value)||0,
        c005: parseFloat(document.getElementById('c005').value)||0,
        c001: parseFloat(document.getElementById('c001').value)||0,
        rq:   parseFloat(document.getElementById('rq').value)||0,
        rvq:  parseFloat(document.getElementById('rvq').value)||10.00,
        rd:   parseFloat(document.getElementById('rd').value)||0,
        rvd:  parseFloat(document.getElementById('rvd').value)||5.00,
        rn:   parseFloat(document.getElementById('rn').value)||0,
        rvn:  parseFloat(document.getElementById('rvn').value)||2.00,
        rp:   parseFloat(document.getElementById('rp').value)||0,
        rvp:  parseFloat(document.getElementById('rvp').value)||0.50
    };
    const total = inputs.b100*100 + inputs.b50*50 + inputs.b20*20 + inputs.b10*10 +
                  inputs.b5*5 + inputs.b2*2 + inputs.b1*1 +
                  inputs.c100*1 + inputs.c050*0.5 + inputs.c025*0.25 +
                  inputs.c010*0.1 + inputs.c005*0.05 + inputs.c001*0.01 +
                  inputs.rq*inputs.rvq + inputs.rd*inputs.rvd +
                  inputs.rn*inputs.rvn + inputs.rp*inputs.rvp;

    drawers[currentDrawer].values = inputs;
    drawers[currentDrawer].total = total;
    drawers[currentDrawer].target = parseFloat(document.getElementById('targetInput').value)||100.00;
    document.getElementById('result').innerHTML = `Total Cash: $${total.toFixed(2)}`;
    safeSave();
}
function clearForm() {
    const ids = ['b100','b50','b20','b10','b5','b2','b1','c100','c050','c025','c010','c005','c001','rq','rd','rn','rp'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (['rvq','rvd','rvn','rvp'].includes(id))
            el.value = {rvq:'10.00',rvd:'5.00',rvn:'2.00',rvp:'0.50'}[id];
        else el.value = '';
    });
    document.getElementById('targetInput').value = '100.00';
    drawers[currentDrawer] = { values:{rvq:10,rvd:5,rvn:2,rvp:0.5}, total:0, target:100, checkoutTarget:100, useRolls:false };
    document.getElementById('result').innerHTML = '';
    safeSave();
}

/* ==================== CHECKOUT & SUMMARY ==================== */
function goToCheckout(){ calculateTotal(); showScreen('checkoutScreen'); }
function goToSummary(){ showScreen('summaryScreen'); }
function goBack(){ showScreen('inputScreen'); }
function goBackFromSummary(){ showScreen('inputScreen'); }

function recalculateRemoval() {
    const d = drawers[currentDrawer];
    const total = d.total, goal = d.target;
    const diffGoal = total - goal;
    const statusEl = document.getElementById('targetStatus');
    if (Math.abs(diffGoal)<0.01) statusEl.innerHTML = `At goal target ($${goal.toFixed(2)})`;
    else if (diffGoal>0) statusEl.innerHTML = `$${diffGoal.toFixed(2)} above goal target ($${goal.toFixed(2)})`;
    else statusEl.innerHTML = `$${Math.abs(diffGoal).toFixed(2)} below goal target ($${goal.toFixed(2)})`;

    const target = parseFloat(document.getElementById('target').value)||100;
    const useRolls = document.getElementById('useRolls').checked;
    d.checkoutTarget = target; d.useRolls = useRolls; safeSave();

    const diff = total - target;
    const list = document.getElementById('removalList'); list.innerHTML = '';
    if (Math.abs(diff)<0.01) { list.innerHTML = '<strong>At default drawer state!</strong>'; return; }
    if (diff<0) { list.innerHTML = `$${Math.abs(diff).toFixed(2)} below default state.<br>Add cash to reach $${target.toFixed(2)}.`; return; }

    let remaining = diff;
    const removal = [];
    const denom = [
        {id:'b100',v:100,n:'$100 bill'},{id:'b50',v:50,n:'$50 bill'},{id:'b20',v:20,n:'$20 bill'},
        {id:'b10',v:10,n:'$10 bill'},{id:'b5',v:5,n:'$5 bill'},{id:'b2',v:2,n:'$2 bill'},
        {id:'b1',v:1,n:'$1 bill'},{id:'c100',v:1,n:'Dollar coin'},{id:'c050',v:0.5,n:'Half-dollar'},
        {id:'c025',v:0.25,n:'Quarter'},{id:'c010',v:0.1,n:'Dime'},{id:'c005',v:0.05,n:'Nickel'},
        {id:'c001',v:0.01,n:'Penny'}
    ];
    if (useRolls) denom.push(
        {id:'rq',v:d.values.rvq,n:'Quarter roll'},{id:'rd',v:d.values.rvd,n:'Dime roll'},
        {id:'rn',v:d.values.rvn,n:'Nickel roll'},{id:'rp',v:d.values.rvp,n:'Penny roll'}
    );

    denom.forEach(o => {
        const cnt = d.values[o.id]||0;
        if (cnt>0 && remaining >= o.v-0.001) {
            const take = Math.min(Math.floor(remaining/o.v), cnt);
            if (take>0) {
                removal.push(`Remove ${take} ${o.n} ($${(take*o.v).toFixed(2)})`);
                remaining -= take*o.v;
                remaining = Math.round(remaining*100)/100;
            }
        }
    });
    if (removal.length) {
        list.innerHTML = removal.join('<br>');
        if (remaining>0.01) list.innerHTML += `<br><strong>Warning:</strong> $${remaining.toFixed(2)} left over`;
    } else list.innerHTML = 'Cannot reach default state with available denominations.';
}

function updateDrawerDisplay() {
    const max = typeof window.maxDrawers==='function'?window.maxDrawers():1;
    if (currentDrawer>max||!drawers[currentDrawer]) currentDrawer=1;
    document.getElementById('drawerTitle').innerText = `Drawer ${currentDrawer}`;
    document.getElementById('prevDrawer').disabled = currentDrawer===1;
    const next = document.getElementById('nextDrawer');
    const tier = window.userTier||'guest';
    if (tier==='supporter') { next.disabled=currentDrawer===max; next.title=''; }
    else { next.disabled=false; next.title=`Upgrade to access Drawer ${currentDrawer+1}`; }

    const v = drawers[currentDrawer].values;
    ['b100','b50','b20','b10','b5','b2','b1','c100','c050','c025','c010','c005','c001',
     'rq','rvq','rd','rvd','rn','rvn','rp','rvp'].forEach(id=>{
        const val = v[id];
        document.getElementById(id).value = (val===undefined||val===0)?'':val;
    });
    document.getElementById('targetInput').value = drawers[currentDrawer].target||100.00;
    document.getElementById('result').innerHTML = drawers[currentDrawer].total?`Total Cash: $${drawers[currentDrawer].total.toFixed(2)}`:'';
}
function updateCheckoutDisplay() {
    document.getElementById('totalCash').innerText = drawers[currentDrawer].total.toFixed(2);
    const saved = drawers[currentDrawer].checkoutTarget??100.00;
    document.getElementById('target').value = saved;
    document.getElementById('goalTarget').innerText = drawers[currentDrawer].target.toFixed(2);
    document.getElementById('useRolls').checked = drawers[currentDrawer].useRolls;
    recalculateRemoval();
}
function updateSummaryDisplay() {
    const tbody = document.getElementById('summaryTable'); tbody.innerHTML='';
    const max = typeof window.maxDrawers==='function'?window.maxDrawers():1;
    for (let i=1;i<=max;i++){
        const total=drawers[i].total, target=drawers[i].target, diff=total-target;
        let status,cls;
        if (Math.abs(diff)<0.01){status='At Target';cls='at-target';}
        else if (diff>0){status=`$${diff.toFixed(2)} Above`;cls='above';}
        else {status=`$${Math.abs(diff).toFixed(2)} Below`;cls='below';}
        tbody.innerHTML+=`<tr><td>Drawer ${i}</td><td>$${total.toFixed(2)}</td><td>$${target.toFixed(2)}</td><td class="${cls}">${status}</td></tr>`;
    }
}

/* ==================== MOBILE INPUT SCROLL ==================== */
const isMobile = ()=>window.innerWidth<=768;
document.querySelectorAll('input[type="number"]').forEach(i=>i.addEventListener('focus',function(){
    if(!isMobile())return;
    setTimeout(()=>{const r=this.getBoundingClientRect();window.scrollTo({top:window.pageYOffset+r.top-120,behavior:'auto'});},100);
}));

/* ==================== AUTO-SAVE ON INPUT ==================== */
document.querySelectorAll('#cashForm input').forEach(i=>i.addEventListener('input',calculateTotal));
document.getElementById('targetInput')?.addEventListener('input',()=>{
    drawers[currentDrawer].target = parseFloat(document.getElementById('targetInput').value)||100.00;
    safeSave();
});

/* ==================== STRIPE API UPGRADE ==================== */
/* ==================== UPGRADE BUTTON – Stripe Checkout API ==================== */
function attachUpgradeButton() {
    const btn = document.getElementById('upgradeToSupporterBtn');
    if (!btn) return;

    // Clone to avoid duplicate listeners
    const newBtn = btn.cloneNode(true);
    btn.replaceWith(newBtn);

    newBtn.addEventListener('click', async () => {
        const user = firebase.auth().currentUser;
        if (!user) {
            alert('Please log in to upgrade.');
            showScreen('loginScreen');
            return;
        }

        try {
            // Disable button and show loading state
            newBtn.disabled = true;
            newBtn.textContent = 'Processing...';

            // Get the user's ID token for authentication
            const idToken = await user.getIdToken();

            // Call the Cloud Function to create a Checkout Session
            const response = await fetch('https://us-central1-backend-c191a.cloudfunctions.net/createCheckoutSession', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to create checkout session');
            }

            const data = await response.json();

            // Redirect to Stripe Checkout
            window.location.href = data.sessionUrl;
        } catch (error) {
            console.error('Error creating checkout session:', error);
            alert('Failed to start checkout. Please try again.');
            newBtn.disabled = false;
            newBtn.textContent = 'Upgrade to Supporter';
        }
    });
}

/* Wait for Firebase Auth to be ready, then attach the button */
let authReady = false;
firebase.auth().onAuthStateChanged(() => {
    authReady = true;
    attachUpgradeButton();
});

/* Show success message when returning from Stripe */
window.addEventListener('load', () => {
    const params = new URLSearchParams(location.search);
    if (params.get('success') || localStorage.getItem('justUpgraded')) {
        localStorage.removeItem('justUpgraded');
        setTimeout(() => {
            alert('Upgrade successful! You are now a Supporter.');
            if (typeof loadUserData === 'function') loadUserData();
        }, 500);
    }
});

/* ==================== EVENT LISTENERS ==================== */
document.getElementById('menuCalculator')?.addEventListener('click', e=>{e.preventDefault();showScreen('inputScreen');closeMenu();});
document.getElementById('menuAbout')?.addEventListener('click', e=>{e.preventDefault();showScreen('aboutScreen');closeMenu();});
document.getElementById('menuPrivacy')?.addEventListener('click', e=>{e.preventDefault();showScreen('privacyScreen');closeMenu();});
document.getElementById('menuAccount')?.addEventListener('click', e=>{e.preventDefault();showScreen('accountScreen');closeMenu();});
document.getElementById('authLink')?.addEventListener('click', e=>{e.preventDefault();handleAuthClick(e);closeMenu();});
document.getElementById('prevDrawer')?.addEventListener('click',()=>switchDrawer(-1));
document.getElementById('nextDrawer')?.addEventListener('click',()=>switchDrawer(1));
document.getElementById('clearFormBtn')?.addEventListener('click',clearForm);
document.getElementById('goToCheckoutBtn')?.addEventListener('click',()=>{calculateTotal();goToCheckout();});
document.getElementById('goToSummaryBtn')?.addEventListener('click',goToSummary);
document.getElementById('checkoutBackBtn')?.addEventListener('click',goBack);
document.getElementById('summaryBackBtn')?.addEventListener('click',goBackFromSummary);
document.getElementById('aboutBackBtn')?.addEventListener('click',()=>showScreen('inputScreen'));
document.getElementById('loginBackBtn')?.addEventListener('click',()=>showScreen('inputScreen'));
document.getElementById('accountBackBtn')?.addEventListener('click',()=>showScreen('inputScreen'));
document.getElementById('privacyBackBtn')?.addEventListener('click',()=>showScreen('inputScreen'));
document.getElementById('loginBtn')?.addEventListener('click',login);
document.getElementById('signupBtn')?.addEventListener('click',signup);
document.getElementById('deleteAccountBtn')?.addEventListener('click',deleteAccount);
document.getElementById('darkModeToggle')?.addEventListener('change', window.toggleDarkMode);
document.getElementById('target')?.addEventListener('input',recalculateRemoval);
document.getElementById('target')?.addEventListener('change',recalculateRemoval);