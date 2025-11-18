function updateDrawerDisplay() {
    document.getElementById('drawerTitle').innerText = `Drawer ${currentDrawer}`;
    document.getElementById('prevDrawer').disabled = currentDrawer === 1;
    document.getElementById('nextDrawer').disabled = currentDrawer === maxDrawers;

    const currentValues = drawers[currentDrawer].values;
    const inputs = ['b100', 'b50', 'b20', 'b10', 'b5', 'b2', 'b1', 'c100', 'c050', 'c025', 'c010', 'c005', 'c001', 'rq', 'rvq', 'rd', 'rvd', 'rn', 'rvn', 'rp', 'rvp'];
    inputs.forEach(id => {
        document.getElementById(id).value = currentValues[id] !== undefined ? currentValues[id] : '';
    });
    document.getElementById('targetInput').value = drawers[currentDrawer].target;
    document.getElementById('result').innerHTML = drawers[currentDrawer].total ? `Total Cash: $${drawers[currentDrawer].total.toFixed(2)}` : '';
}

function updateCheckoutDisplay() {
    document.getElementById('totalCash').innerText = drawers[currentDrawer].total.toFixed(2);
    document.getElementById('target').value = drawers[currentDrawer].target;
    document.getElementById('useRolls').checked = drawers[currentDrawer].useRolls;
    recalculateRemoval();
}

function updateSummaryDisplay() {
    const tableBody = document.getElementById('summaryTable');
    tableBody.innerHTML = '';
    for (let i = 1; i <= maxDrawers; i++) {
        const total = drawers[i].total;
        const target = drawers[i].target;
        const difference = total - target;
        let status, statusClass;
        if (Math.abs(difference) < 0.01) {
            status = 'At Target';
            statusClass = 'at-target';
        } else if (difference > 0) {
            status = `$${difference.toFixed(2)} Above`;
            statusClass = 'above';
        } else {
            status = `$${Math.abs(difference).toFixed(2)} Below`;
            statusClass = 'below';
        }
        tableBody.innerHTML += `
            <tr>
                <td>Drawer ${i}</td>
                <td>$${total.toFixed(2)}</td>
                <td>$${target.toFixed(2)}</td>
                <td class="${statusClass}">${status}</td>
            </tr>
        `;
    }
}

