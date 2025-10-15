const API_KEY = 'sk_6awg6fl8gt5JtbcQfXMeAcLGOPyhANQ2';
const BACKEND_URL = window.location.origin;

let invoiceHistory = [];
let discountData = { value: 0, type: '%' };
let shippingData = { value: 0 };
let logoBase64 = '';
let currentCurrency = { code: 'USD', symbol: '$' };

const currencySymbols = {
    'USD': '$', 'EUR': '€', 'GBP': '£', 'INR': '₹', 'CAD': '$', 'AUD': '$'
};

document.addEventListener('DOMContentLoaded', () => {
    checkBackendConnection();
    initializeDateFields();
    initializeLineItems();
    setupEventListeners();
    loadInvoiceHistory();
});

async function checkBackendConnection() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/invoices`, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('Backend not responding');
        const ct = res.headers.get('content-type');
        if (!ct || !ct.includes('application/json')) throw new Error('Backend not responding with JSON');
    } catch (e) {
        showMessage('⚠️ Backend server not running! Start with: npm start', 'error');
    }
}

function initializeDateFields() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('invoiceDate').value = today;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    document.getElementById('dueDate').value = dueDate.toISOString().split('T')[0];
    const cs = document.getElementById('currency');
    currentCurrency = { code: cs.value, symbol: currencySymbols[cs.value] || '$' };
    updateCurrencySymbols();
}

function initializeLineItems() { addLineItem(); }

function setupEventListeners() {
    document.getElementById('generateBtn').addEventListener('click', handleFormSubmit);
    document.getElementById('addLineItem').addEventListener('click', addLineItem);
    document.getElementById('addDiscount').addEventListener('click', openDiscountModal);
    document.getElementById('addShipping').addEventListener('click', openShippingModal);
    document.getElementById('logoFile').addEventListener('change', handleLogoUpload);
    document.getElementById('removeLogoBtn').addEventListener('click', removeLogo);
    document.getElementById('currency').addEventListener('change', handleCurrencyChange);
    document.getElementById('taxValue').addEventListener('input', calculateTotals);
    document.getElementById('taxType').addEventListener('change', calculateTotals);
    document.getElementById('amountPaid').addEventListener('input', calculateTotals);
}

function handleCurrencyChange(e) {
    const cc = e.target.value;
    currentCurrency = { code: cc, symbol: currencySymbols[cc] || '$' };
    updateCurrencySymbols();
    calculateTotals();
}

function updateCurrencySymbols() {
    const s = currentCurrency.symbol;
    document.querySelectorAll('.currency-prefix').forEach(el => el.textContent = s);
    const tfo = document.getElementById('taxFlatOption');
    if (tfo) tfo.textContent = s;
    document.querySelectorAll('.amount-display').forEach(el => {
        const v = el.textContent.replace(/[^0-9.]/g, '');
        el.textContent = `${s}${v}`;
    });
    document.getElementById('subtotalValue').textContent = `${s}0.00`;
    document.getElementById('taxAmount').textContent = `${s}0.00`;
    document.getElementById('totalValue').textContent = `${s}0.00`;
    document.getElementById('balanceValue').textContent = `${s}0.00`;
    if (discountData.value > 0) {
        const da = document.getElementById('discountAmount');
        const v = da.textContent.replace(/[^0-9.]/g, '');
        da.textContent = `-${s}${v}`;
    }
    if (shippingData.value > 0) {
        const sa = document.getElementById('shippingAmount');
        const v = sa.textContent.replace(/[^0-9.]/g, '');
        sa.textContent = `${s}${v}`;
    }
    document.querySelector('.currency-symbol').textContent = s;
    calculateTotals();
}

function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showMessage('Please upload an image file', 'error');
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showMessage('Image size should be less than 2MB', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
        logoBase64 = event.target.result;
        const preview = document.getElementById('logoPreview');
        const placeholder = document.getElementById('logoPlaceholder');
        const removeBtn = document.getElementById('removeLogoBtn');
        preview.src = logoBase64;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
        removeBtn.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function removeLogo() {
    logoBase64 = '';
    const preview = document.getElementById('logoPreview');
    const placeholder = document.getElementById('logoPlaceholder');
    const removeBtn = document.getElementById('removeLogoBtn');
    const fileInput = document.getElementById('logoFile');
    preview.src = '';
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    removeBtn.classList.add('hidden');
    fileInput.value = '';
}

async function loadInvoiceHistory() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/invoices`, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('Failed to load history');
        const ct = res.headers.get('content-type');
        if (!ct || !ct.includes('application/json')) return;
        const data = await res.json();
        if (data.invoices && data.invoices.length > 0) {
            invoiceHistory = data.invoices.slice(0, 10);
            updateHistoryDisplay();
        }
    } catch (e) {
        console.error('Error loading history:', e);
    }
}

function addLineItem() {
    const tbody = document.getElementById('itemsTableBody');
    const row = tbody.insertRow();
    row.innerHTML = `
        <td><input type="text" class="item-input item-name" placeholder="Description of item/service..." required></td>
        <td><input type="number" class="item-input item-quantity-input" value="1" step="0.01" min="0" required></td>
        <td><div style="display: flex; align-items: center; justify-content: flex-end;"><span class="currency-prefix">${currentCurrency.symbol}</span><input type="number" class="item-input item-rate-input" value="0" step="0.01" min="0" required></div></td>
        <td class="item-amount"><div style="display: flex; align-items: center; justify-content: space-between;"><span class="amount-display">${currentCurrency.symbol}0.00</span><button type="button" class="delete-item-btn" onclick="deleteLineItem(this)">×</button></div></td>
    `;
    row.querySelector('.item-quantity-input').addEventListener('input', () => updateRowAmount(row));
    row.querySelector('.item-rate-input').addEventListener('input', () => updateRowAmount(row));
    updateRowAmount(row);
}

function deleteLineItem(btn) {
    const tbody = document.getElementById('itemsTableBody');
    if (tbody.rows.length > 1) {
        btn.closest('tr').remove();
        calculateTotals();
    } else {
        showMessage('You must have at least one line item', 'error');
    }
}

function updateRowAmount(row) {
    const q = parseFloat(row.querySelector('.item-quantity-input').value) || 0;
    const r = parseFloat(row.querySelector('.item-rate-input').value) || 0;
    const a = q * r;
    row.querySelector('.amount-display').textContent = `${currentCurrency.symbol}${a.toFixed(2)}`;
    calculateTotals();
}

function calculateTotals() {
    const s = currentCurrency.symbol;
    let subtotal = 0;
    const rows = document.querySelectorAll('#itemsTableBody tr');
    rows.forEach(row => {
        const q = parseFloat(row.querySelector('.item-quantity-input').value) || 0;
        const r = parseFloat(row.querySelector('.item-rate-input').value) || 0;
        subtotal += q * r;
    });
    document.getElementById('subtotalValue').textContent = `${s}${subtotal.toFixed(2)}`;
    let total = subtotal;
    if (discountData.value > 0) {
        let disc = 0;
        if (discountData.type === '%') disc = (subtotal * discountData.value / 100);
        else disc = discountData.value;
        total -= disc;
        document.getElementById('discountAmount').textContent = `-${s}${disc.toFixed(2)}`;
    }
    const tv = parseFloat(document.getElementById('taxValue').value) || 0;
    const tt = document.getElementById('taxType').value;
    let tax = 0;
    if (tv > 0) {
        if (tt === '%') tax = (total * tv / 100);
        else tax = tv;
        total += tax;
    }
    document.getElementById('taxAmount').textContent = `${s}${tax.toFixed(2)}`;
    if (shippingData.value > 0) {
        total += shippingData.value;
        document.getElementById('shippingAmount').textContent = `${s}${shippingData.value.toFixed(2)}`;
    }
    document.getElementById('totalValue').textContent = `${s}${total.toFixed(2)}`;
    const ap = parseFloat(document.getElementById('amountPaid').value) || 0;
    const bal = total - ap;
    document.getElementById('balanceValue').textContent = `${s}${bal.toFixed(2)}`;
}

function openDiscountModal() {
    document.getElementById('discountModal').classList.remove('hidden');
    document.getElementById('discountValue').value = discountData.value || '';
    document.getElementById('discountType').value = discountData.type;
}

function closeDiscountModal() {
    document.getElementById('discountModal').classList.add('hidden');
}

function applyDiscount() {
    const val = parseFloat(document.getElementById('discountValue').value) || 0;
    const type = document.getElementById('discountType').value;
    discountData = { value: val, type };
    if (val > 0) document.getElementById('discountRow').classList.remove('hidden');
    else document.getElementById('discountRow').classList.add('hidden');
    calculateTotals();
    closeDiscountModal();
}

function openShippingModal() {
    document.getElementById('shippingModal').classList.remove('hidden');
    document.getElementById('shippingValue').value = shippingData.value || '';
}

function closeShippingModal() {
    document.getElementById('shippingModal').classList.add('hidden');
}

function applyShipping() {
    const val = parseFloat(document.getElementById('shippingValue').value) || 0;
    shippingData = { value: val };
    if (val > 0) document.getElementById('shippingRow').classList.remove('hidden');
    else document.getElementById('shippingRow').classList.add('hidden');
    calculateTotals();
    closeShippingModal();
}

async function handleFormSubmit(e) {
    if (e) e.preventDefault();
    if (!document.getElementById('invoiceForm').checkValidity()) {
        document.getElementById('invoiceForm').reportValidity();
        return;
    }
    const invData = collectFormData();
    const btn = document.getElementById('generateBtn');
    const origTxt = btn.innerHTML;
    btn.innerHTML = '<span style="display: inline-block; width: 16px; height: 16px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite;"></span> Creating...';
    btn.disabled = true;
    try {
        const res = await fetch(`${BACKEND_URL}/api/generate-invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ apiKey: API_KEY, invoiceData: invData })
        });
        const ct = res.headers.get('content-type');
        if (!ct || !ct.includes('application/json')) throw new Error('Server not running. Please run: npm start');
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to generate invoice');
        }
        const result = await res.json();
        showMessage(`✓ Invoice #${invData.number} generated successfully!`, 'success');
        const pdfRes = await fetch(`${BACKEND_URL}/api/invoices/${result.filename}`);
        const blob = await pdfRes.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        await loadInvoiceHistory();
        incrementInvoiceNumber();
    } catch (e) {
        console.error('Error:', e);
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
            showMessage('❌ Cannot connect to server. Run: npm start', 'error');
        } else if (e.message.includes('Server not running')) {
            showMessage('❌ ' + e.message, 'error');
        } else {
            showMessage(`❌ Error: ${e.message}`, 'error');
        }
    } finally {
        btn.innerHTML = origTxt;
        btn.disabled = false;
    }
}

function collectFormData() {
    const data = {
        number: document.getElementById('invoiceNumber').value,
        currency: document.getElementById('currency').value.toLowerCase(),
        date: formatDate(document.getElementById('invoiceDate').value),
        from: document.getElementById('fromDetails').value,
        to: document.getElementById('toDetails').value,
        items: collectLineItems(),
    };
    if (logoBase64) data.logo = logoBase64;
    const dd = document.getElementById('dueDate').value;
    if (dd) data.due_date = formatDate(dd);
    const st = document.getElementById('shipTo').value.trim();
    if (st) data.ship_to = st;
    const pt = document.getElementById('paymentTerms').value.trim();
    if (pt) data.payment_terms = pt;
    const po = document.getElementById('poNumber').value.trim();
    if (po) {
        if (!data.custom_fields) data.custom_fields = [];
        data.custom_fields.push({ name: 'PO Number', value: po });
    }
    const notes = document.getElementById('notes').value.trim();
    if (notes) data.notes = notes;
    const terms = document.getElementById('terms').value.trim();
    if (terms) data.terms = terms;
    const tv = parseFloat(document.getElementById('taxValue').value) || 0;
    const tt = document.getElementById('taxType').value;
    if (tv > 0) {
        data.tax = tv;
        if (!data.fields) data.fields = {};
        data.fields.tax = tt === '%' ? '%' : true;
    }
    if (shippingData.value > 0) {
        data.shipping = shippingData.value;
        if (!data.fields) data.fields = {};
        data.fields.shipping = true;
    }
    if (discountData.value > 0) {
        data.discounts = discountData.value;
        if (!data.fields) data.fields = {};
        data.fields.discounts = discountData.type === '%' ? '%' : true;
    }
    const ap = parseFloat(document.getElementById('amountPaid').value) || 0;
    if (ap > 0) data.amount_paid = ap;
    return data;
}

function collectLineItems() {
    const items = [];
    const rows = document.querySelectorAll('#itemsTableBody tr');
    rows.forEach(row => {
        const name = row.querySelector('.item-name').value.trim();
        const q = parseFloat(row.querySelector('.item-quantity-input').value) || 0;
        const uc = parseFloat(row.querySelector('.item-rate-input').value) || 0;
        items.push({ name, quantity: q, unit_cost: uc });
    });
    return items;
}

function formatDate(ds) {
    const d = new Date(ds);
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

async function downloadInvoice(fn) {
    try {
        const res = await fetch(`${BACKEND_URL}/api/invoices/${fn}`);
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fn;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showMessage(`✓ Downloaded ${fn}`, 'success');
    } catch (e) {
        showMessage(`❌ Error: ${e.message}`, 'error');
    }
}

function updateHistoryDisplay() {
    const cont = document.getElementById('historyList');
    if (invoiceHistory.length === 0) {
        cont.innerHTML = '<p class="empty-history">No invoices yet</p>';
        return;
    }
    cont.innerHTML = invoiceHistory.map(inv => `
        <div class="history-item" onclick="downloadInvoice('${inv.filename}')">
            <div class="history-item-name">${inv.filename}</div>
            <div class="history-item-date">${new Date(inv.created).toLocaleDateString()}</div>
        </div>
    `).join('');
}

function showMessage(txt, type = 'info') {
    const cont = document.getElementById('messageContainer');
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const msg = document.createElement('div');
    msg.className = `message message-${type}`;
    msg.innerHTML = `<span class="message-icon">${icons[type]}</span><span class="message-content">${txt}</span>`;
    cont.appendChild(msg);
    setTimeout(() => {
        msg.style.opacity = '0';
        setTimeout(() => msg.remove(), 300);
    }, 6000);
}

function incrementInvoiceNumber() {
    const inp = document.getElementById('invoiceNumber');
    const cur = parseInt(inp.value) || 0;
    inp.value = cur + 1;
}

window.deleteLineItem = deleteLineItem;
window.closeDiscountModal = closeDiscountModal;
window.applyDiscount = applyDiscount;
window.closeShippingModal = closeShippingModal;
window.applyShipping = applyShipping;
window.downloadInvoice = downloadInvoice;

const style = document.createElement('style');
style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(style);