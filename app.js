



// --- STATE MANAGEMENT ---
const STATE = {
    cart: JSON.parse(localStorage.getItem('pos_cart') || '[]'),
    sales: JSON.parse(localStorage.getItem('pos_sales') || '[]'),
    drafts: JSON.parse(localStorage.getItem('pos_drafts') || '[]'),
    inventory: [],
    lastId: parseInt(localStorage.getItem('pos_last_id') || '0'),
    deviceId: localStorage.getItem('pos_device_id') || 'POS1'
};

// --- DOM ELEMENTS ---
const UI = {
    skuSearch: document.getElementById('skuSearch'),
    searchClear: document.getElementById('searchClear'),
    skuSelect: document.getElementById('skuSelect'),
    itemPreview: document.getElementById('itemPreview'),
    previewDesc: document.getElementById('previewDesc'),
    previewCat: document.getElementById('previewCat'),
    previewCost: document.getElementById('previewCost'),
    previewCostInput: document.getElementById('previewCostInput'),
    previewStock: document.getElementById('previewStock'),
    quantity: document.getElementById('quantity'),
    addToCartBtn: document.getElementById('addToCartBtn'),
    cartSection: document.getElementById('cartSection'),
    cartList: document.getElementById('cartList'),
    cartSubtotal: document.getElementById('cartSubtotal'),
    cartTotal: document.getElementById('cartTotal'),
    dealPrice: document.getElementById('dealPrice'),
    clearCartBtn: document.getElementById('clearCartBtn'),
    saveDraftBtn: document.getElementById('saveDraftBtn'),
    checkoutBtn: document.getElementById('checkoutBtn'),
    draftsSection: document.getElementById('draftsSection'),
    draftsList: document.getElementById('draftsList'),
    paymentOptions: document.querySelectorAll('.payment-option'),
    salesList: document.getElementById('salesList'),
    totalCount: document.getElementById('totalCount'),
    totalRevenue: document.getElementById('totalRevenue'),
    totalRevenue: document.getElementById('totalRevenue'),
    exportBtn: document.getElementById('exportBtn'),
    resetBtn: document.getElementById('resetBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    toast: document.getElementById('toast'),
    installPrompt: document.getElementById('installPrompt'),
    modeToggleBtn: document.getElementById('modeToggleBtn'),
    searchMode: document.getElementById('searchMode'),
    manualMode: document.getElementById('manualMode'),
    manualDesc: document.getElementById('manualDesc'),
    manualPrice: document.getElementById('manualPrice'),
    modalOverlay: document.getElementById('modalOverlay'),
    modalCard: document.getElementById('modalCard'),
    modalTitle: document.getElementById('modalTitle'),
    modalMessage: document.getElementById('modalMessage'),
    modalInput: document.getElementById('modalInput'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    modalConfirmBtn: document.getElementById('modalConfirmBtn')
};

let selectedItem = null;
let selectedPayment = null;
let isManualMode = false;

// --- INITIALIZATION ---

async function loadInventory() {
    try {
        const response = await fetch('./inventory.json');
        if (!response.ok) throw new Error('Failed to load inventory');
        STATE.inventory = await response.json();
    } catch (error) {
        console.error('Error loading inventory:', error);
        customAlert('Could not load inventory data. Please check your connection.');
    }
}

async function init() {
    await loadInventory();

    renderInventorySelect();
    renderCart();
    renderDrafts();
    renderSales();
    checkInstallPrompt();

    // Restore payment selection if in cart
    if (STATE.cart.length > 0) {
        UI.cartSection.style.display = 'block';
    }
}

// --- INVENTORY & SEARCH ---
function renderInventorySelect(items = STATE.inventory) {
    UI.skuSelect.innerHTML = '<option value="">Select from list...</option>';
    const limit = items.length;

    for (let i = 0; i < limit; i++) {
        const item = items[i];
        const option = document.createElement('option');
        option.value = item.sku;
        option.textContent = `${item.sku} - ${item.description}`;
        UI.skuSelect.appendChild(option);
    }
}

UI.skuSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    UI.searchClear.classList.toggle('visible', term.length > 0);

    if (!term) {
        renderInventorySelect();
        return;
    }

    const filtered = STATE.inventory.filter(item =>
        item.sku.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term)
    );
    renderInventorySelect(filtered);

    // Auto-select if exact match
    if (filtered.length === 1) {
        UI.skuSelect.value = filtered[0].sku;
        selectItem(filtered[0].sku);
    }
});

UI.searchClear.addEventListener('click', () => {
    UI.skuSearch.value = '';
    UI.searchClear.classList.remove('visible');
    renderInventorySelect();
    resetSelection();
});

UI.skuSelect.addEventListener('change', (e) => {
    selectItem(e.target.value);
});

function getAvailableStock(sku) {
    const item = STATE.inventory.find(i => i.sku === sku);
    if (!item || item.quantity == null) return null;

    const soldInSales = STATE.sales.reduce((sum, sale) =>
        sum + sale.items.filter(i => i.sku === sku).reduce((s, i) => s + i.quantity, 0), 0);

    const inCart = STATE.cart
        .filter(i => i.sku === sku)
        .reduce((s, i) => s + i.quantity, 0);

    return Math.max(0, item.quantity - soldInSales - inCart);
}

function refreshStockDisplay() {
    if (!selectedItem || isManualMode) return;
    const stock = getAvailableStock(selectedItem.sku);
    if (stock === null) {
        UI.previewStock.textContent = '-';
        UI.previewStock.style.color = '';
    } else if (stock === 0) {
        UI.previewStock.textContent = '0 — Out of Stock';
        UI.previewStock.style.color = 'var(--danger)';
    } else if (stock <= 2) {
        UI.previewStock.textContent = `${stock} — Low`;
        UI.previewStock.style.color = '#f59e0b';
    } else {
        UI.previewStock.textContent = stock;
        UI.previewStock.style.color = '';
    }
}

function selectItem(sku) {
    if (!sku) {
        resetSelection();
        return;
    }
    selectedItem = STATE.inventory.find(i => i.sku === sku);
    if (selectedItem) {
        UI.previewDesc.textContent = selectedItem.description;
        UI.previewCat.textContent = selectedItem.category;
        UI.previewCost.textContent = selectedItem.cost != null ? `$${selectedItem.cost.toFixed(2)}` : '-';
        UI.previewCostInput.value = selectedItem.price.toFixed(2);
        refreshStockDisplay();
        UI.itemPreview.classList.add('visible');
        UI.addToCartBtn.disabled = false;
    }
}

function resetSelection() {
    selectedItem = null;
    UI.skuSelect.value = '';
    UI.itemPreview.classList.remove('visible');
    UI.addToCartBtn.disabled = true;
    UI.quantity.value = 1;

    // Reset manual inputs too
    UI.manualDesc.value = '';
    UI.manualPrice.value = '';
}

// --- MANUAL MODE TOGGLE ---
UI.modeToggleBtn.addEventListener('click', () => {
    isManualMode = !isManualMode;
    UI.searchMode.style.display = isManualMode ? 'none' : 'block';
    UI.manualMode.style.display = isManualMode ? 'block' : 'none';
    UI.modeToggleBtn.textContent = isManualMode ? 'Switch to Search' : 'Switch to Manual';

    resetSelection();
    checkAddButton();
});

// Manual Input Validation
[UI.manualDesc, UI.manualPrice].forEach(el => {
    el.addEventListener('input', checkAddButton);
});

function checkAddButton() {
    if (isManualMode) {
        const hasDesc = UI.manualDesc.value.trim().length > 0;
        const price = parseFloat(UI.manualPrice.value);
        const hasPrice = !isNaN(price) && price >= 0;
        UI.addToCartBtn.disabled = !(hasDesc && hasPrice);
    } else {
        UI.addToCartBtn.disabled = !selectedItem;
    }
}

window.adjustQty = function (delta) {
    const newVal = parseInt(UI.quantity.value) + delta;
    if (newVal >= 1) UI.quantity.value = newVal;
};

// --- CART MANAGEMENT ---
UI.addToCartBtn.addEventListener('click', () => {
    let itemToAdd = null;
    const qty = parseInt(UI.quantity.value);

    if (isManualMode) {
        const desc = UI.manualDesc.value.trim();
        const price = parseFloat(UI.manualPrice.value);

        if (!desc || isNaN(price) || price < 0) {
            customAlert('Please enter a valid description and price for manual item.');
            return;
        }

        itemToAdd = {
            sku: 'MANUAL',
            description: desc,
            category: 'Manual',
            quantity: qty,
            unitPrice: price,
            lineTotal: price * qty
        };
    } else {
        if (!selectedItem) return;
        const editedPrice = parseFloat(UI.previewCostInput.value);
        if (isNaN(editedPrice) || editedPrice < 0) {
            customAlert('Please enter a valid price for the selected item.');
            return;
        }
        itemToAdd = {
            sku: selectedItem.sku,
            description: selectedItem.description,
            category: selectedItem.category,
            quantity: qty,
            unitPrice: editedPrice,
            lineTotal: editedPrice * qty
        };
    }

    STATE.cart.push(itemToAdd);

    saveCart();
    renderCart();
    resetSelection();
    UI.skuSearch.value = '';
    UI.searchClear.classList.remove('visible');
    renderInventorySelect();
    showToast('Item added to cart');
});

function saveCart() {
    localStorage.setItem('pos_cart', JSON.stringify(STATE.cart));
}

function renderCart() {
    if (STATE.cart.length === 0) {
        UI.cartSection.style.display = 'none';
        return;
    }

    UI.cartSection.style.display = 'block';
    UI.cartList.innerHTML = STATE.cart.map((item, idx) => `
                <div class="cart-item">
                    <div class="cart-item-details">
                        <div class="cart-item-title">${item.description}</div>
                        <div class="cart-item-meta">
                            ${item.sku} • ${item.quantity} × 
                            $<input type="number" 
                                    value="${item.unitPrice.toFixed(2)}" 
                                    onchange="updateCartPrice(${idx}, this.value)"
                                    onclick="this.select()"
                                    style="width: 70px; padding: 2px 4px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                        </div>
                    </div>
                    <div class="cart-item-price">$${item.lineTotal.toFixed(2)}</div>
                    <button class="cart-remove" onclick="removeFromCart(${idx})">×</button>
                </div>
            `).join('');

    updateTotals();
}

window.removeFromCart = function (idx) {
    STATE.cart.splice(idx, 1);
    saveCart();
    renderCart();
    refreshStockDisplay();
};

window.updateCartPrice = function (idx, newPrice) {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) {
        customAlert('Invalid price');
        renderCart(); // Reset to old value
        return;
    }
    STATE.cart[idx].unitPrice = price;
    STATE.cart[idx].lineTotal = price * STATE.cart[idx].quantity;
    saveCart();
    renderCart();
};

UI.clearCartBtn.addEventListener('click', async () => {
    if (await customConfirm('Clear cart?')) {
        clearCart();
    }
});

function clearCart() {
    STATE.cart = [];
    selectedPayment = null;
    UI.dealPrice.value = '';
    UI.paymentOptions.forEach(el => el.classList.remove('selected'));
    saveCart();
    renderCart();
}

// --- DRAFTS ---
UI.saveDraftBtn.addEventListener('click', async () => {
    const name = await customPrompt('Enter a name for this draft (e.g. Customer Name):');
    if (name === null) return; // Cancelled

    const draft = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        name: name || 'Untitled Draft',
        items: [...STATE.cart],
        dealPrice: UI.dealPrice.value
    };

    STATE.drafts.push(draft);
    localStorage.setItem('pos_drafts', JSON.stringify(STATE.drafts));

    clearCart();
    renderDrafts();
    showToast('Draft saved!');
});

function renderDrafts() {
    if (STATE.drafts.length === 0) {
        UI.draftsSection.style.display = 'none';
        return;
    }

    UI.draftsSection.style.display = 'block';
    UI.draftsList.innerHTML = STATE.drafts.map((draft, idx) => {
        const total = draft.items.reduce((sum, item) => sum + item.lineTotal, 0);
        const itemCount = draft.items.reduce((sum, item) => sum + item.quantity, 0);

        return `
                    <div class="cart-item">
                        <div class="cart-item-details">
                            <div class="cart-item-title">${draft.name}</div>
                            <div class="cart-item-meta">
                                ${new Date(draft.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • 
                                ${itemCount} items • $${total.toFixed(2)}
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-sm btn-primary" style="width: auto;" onclick="loadDraft(${idx})">Load</button>
                            <button class="cart-remove" onclick="deleteDraft(${idx})">×</button>
                        </div>
                    </div>
                    `;
    }).join('');
}

window.loadDraft = async function (idx) {
    if (STATE.cart.length > 0) {
        if (!(await customConfirm('Current cart is not empty. Overwrite with draft?'))) return;
    }

    const draft = STATE.drafts[idx];
    STATE.cart = [...draft.items];
    UI.dealPrice.value = draft.dealPrice || '';

    // Remove from drafts after loading? Optional. Let's keep it until manually deleted or maybe remove it.
    // Standard POS usually removes it to prevent double charging.
    STATE.drafts.splice(idx, 1);
    localStorage.setItem('pos_drafts', JSON.stringify(STATE.drafts));

    saveCart();
    renderCart();
    renderDrafts();
    showToast('Draft loaded!');
};

window.deleteDraft = async function (idx) {
    if (!(await customConfirm('Delete this draft?'))) return;
    STATE.drafts.splice(idx, 1);
    localStorage.setItem('pos_drafts', JSON.stringify(STATE.drafts));
    renderDrafts();
};

// --- PRICING & CHECKOUT ---
function updateTotals() {
    const subtotal = STATE.cart.reduce((sum, item) => sum + item.lineTotal, 0);
    UI.cartSubtotal.textContent = `$${subtotal.toFixed(2)}`;

    const dealVal = parseFloat(UI.dealPrice.value);
    const finalTotal = !isNaN(dealVal) && dealVal >= 0 ? dealVal : subtotal;

    UI.cartTotal.textContent = `$${finalTotal.toFixed(2)}`;
    checkCheckoutReady();
}

UI.dealPrice.addEventListener('input', updateTotals);

UI.paymentOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        UI.paymentOptions.forEach(el => el.classList.remove('selected'));
        opt.classList.add('selected');
        selectedPayment = opt.dataset.method;
        checkCheckoutReady();
    });
});

function checkCheckoutReady() {
    UI.checkoutBtn.disabled = !(STATE.cart.length > 0 && selectedPayment);
}

UI.checkoutBtn.addEventListener('click', () => {
    const subtotal = STATE.cart.reduce((sum, item) => sum + item.lineTotal, 0);
    const dealVal = parseFloat(UI.dealPrice.value);
    const isDeal = !isNaN(dealVal) && dealVal >= 0;
    const finalTotal = isDeal ? dealVal : subtotal;

    // Distribute deal price if applicable
    const finalItems = STATE.cart.map(item => {
        let actualPrice = item.lineTotal;
        if (isDeal && subtotal > 0) {
            actualPrice = (item.lineTotal / subtotal) * finalTotal;
        }
        return { ...item, actualPrice };
    });

    const sale = {
        id: `${STATE.deviceId}-${++STATE.lastId}`,
        timestamp: new Date().toISOString(),
        items: finalItems,
        total: finalTotal,
        paymentMethod: selectedPayment,
        isDeal: isDeal
    };

    STATE.sales.unshift(sale);
    localStorage.setItem('pos_sales', JSON.stringify(STATE.sales));
    localStorage.setItem('pos_last_id', STATE.lastId.toString());

    // Reset Cart
    clearCart();
    renderSales();
    renderSales();

    showToast('Sale recorded successfully!');
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// --- SALES HISTORY ---
function renderSales() {
    UI.totalCount.textContent = STATE.sales.length;
    const revenue = STATE.sales.reduce((sum, s) => sum + s.total, 0);
    UI.totalRevenue.textContent = `$${revenue.toFixed(2)}`;

    if (STATE.sales.length === 0) {
        UI.salesList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No sales today</div>';
        return;
    }

    UI.salesList.innerHTML = STATE.sales.map(sale => `
                <div class="sale-record-wrapper" style="border-bottom: 1px solid var(--border);">
                    <div class="sale-record">
                        <div class="sale-info">
                            <h4>#${sale.id} • ${sale.items.length} Items</h4>
                            <div class="sale-meta">
                                ${new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • 
                                ${sale.paymentMethod.toUpperCase()}
                                ${sale.isDeal ? '• DEAL' : ''}
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="sale-amount">$${sale.total.toFixed(2)}</div>
                            <button class="btn btn-sm btn-outline" onclick="toggleSaleDetails('${sale.id}')">View</button>
                            <button class="cart-remove" onclick="deleteSale('${sale.id}')">×</button>
                        </div>
                    </div>
                    <div id="sale-details-${sale.id}" style="display: none; background: #f9fafb; padding: 10px; font-size: 13px;">
                        ${sale.items.map(item => `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span>${item.quantity}x <span style="color: #666; font-size: 0.9em;">[${item.sku}]</span> ${item.description}</span>
                                <span>$${item.actualPrice.toFixed(2)}</span>
                            </div>
                        `).join('')}
                        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ccc; display: flex; align-items: center; justify-content: space-between;">
                            <span>Payment: <strong>${sale.paymentMethod.toUpperCase()}</strong></span>
                            <div>
                                <button class="btn btn-sm btn-outline" style="font-size: 12px; padding: 4px 8px;" onclick="updateSalePayment('${sale.id}', 'cash')">Cash</button>
                                <button class="btn btn-sm btn-outline" style="font-size: 12px; padding: 4px 8px;" onclick="updateSalePayment('${sale.id}', 'payid')">PayID</button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
}

window.toggleSaleDetails = function (id) {
    const el = document.getElementById(`sale-details-${id}`);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
};

window.deleteSale = async function (id) {
    if (await customConfirm(`Delete Sale #${id}?\nThis cannot be undone.`, 'Delete Sale')) {
        STATE.sales = STATE.sales.filter(s => s.id != id);
        localStorage.setItem('pos_sales', JSON.stringify(STATE.sales));
        renderSales();
        showToast('Sale deleted');
    }
};

window.updateSalePayment = async function (id, newMethod) {
    const sale = STATE.sales.find(s => s.id == id);
    if (sale && sale.paymentMethod !== newMethod) {
        if (await customConfirm(`Change payment method to ${newMethod.toUpperCase()}?`)) {
            sale.paymentMethod = newMethod;
            localStorage.setItem('pos_sales', JSON.stringify(STATE.sales));
            renderSales();
            showToast('Payment updated');
        }
    }
};

UI.resetBtn.addEventListener('click', async () => {
    if (await customConfirm('⚠️ DELETE ALL SALES HISTORY?\nThis cannot be undone.', 'Warning')) {
        STATE.sales = [];
        STATE.lastId = 0;
        localStorage.removeItem('pos_sales');
        localStorage.removeItem('pos_last_id');
        renderSales();
    }
});

UI.settingsBtn.addEventListener('click', async () => {
    const newId = await customPrompt('Enter Device ID (e.g. A, B, POS1):', STATE.deviceId, 'Settings');
    if (newId && newId.trim() !== '') {
        STATE.deviceId = newId.trim();
        localStorage.setItem('pos_device_id', STATE.deviceId);
        showToast(`Device ID set to: ${STATE.deviceId}`);
    }
});

// --- EXPORT ---
UI.exportBtn.addEventListener('click', async () => {
    if (STATE.sales.length === 0) {
        customAlert('No sales to export');
        return;
    }

    // Generate CSV
    const headers = ['ID', 'Timestamp', 'SKU', 'Description', 'Category', 'Qty', 'List Price', 'Actual Price', 'Tx Total', 'Payment', 'Is Deal'];
    const rows = [headers.join(',')];

    STATE.sales.forEach(sale => {
        sale.items.forEach(item => {
            rows.push([
                sale.id,
                sale.timestamp,
                `"${item.sku}"`,
                `"${item.description}"`,
                `"${item.category}"`,
                item.quantity,
                item.unitPrice.toFixed(2),
                item.actualPrice.toFixed(2),
                sale.total.toFixed(2),
                sale.paymentMethod,
                sale.isDeal ? 'Yes' : 'No'
            ].join(','));
        });
    });

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-').substring(0, 5); // HH-MM
    const csvContent = rows.join('\n');
    const fileName = `sales_export_${dateStr}_${timeStr}.csv`;
    const file = new File([csvContent], fileName, { type: 'text/csv' });

    // Try Web Share API first (Best for iOS)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Sales Export',
                text: 'Here is the sales export CSV.'
            });
            return;
        } catch (err) {
            console.log('Share failed', err);
        }
    }

    // Fallback to download
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
});

// --- CUSTOM MODALS ---
function customAlert(message, title = 'Notification') {
    return new Promise(resolve => {
        UI.modalTitle.textContent = title;
        UI.modalMessage.innerHTML = message.replace(/\n/g, '<br>');
        UI.modalInput.style.display = 'none';
        UI.modalCancelBtn.style.display = 'none';
        
        UI.modalOverlay.classList.add('active');
        
        const onConfirm = () => {
            UI.modalOverlay.classList.remove('active');
            cleanup();
            resolve();
        };
        
        const cleanup = () => {
            UI.modalConfirmBtn.removeEventListener('click', onConfirm);
        };
        
        UI.modalConfirmBtn.addEventListener('click', onConfirm);
    });
}

function customConfirm(message, title = 'Confirm') {
    return new Promise(resolve => {
        UI.modalTitle.textContent = title;
        UI.modalMessage.innerHTML = message.replace(/\n/g, '<br>');
        UI.modalInput.style.display = 'none';
        UI.modalCancelBtn.style.display = 'block';
        
        UI.modalOverlay.classList.add('active');
        
        const onConfirm = () => {
            UI.modalOverlay.classList.remove('active');
            cleanup();
            resolve(true);
        };
        
        const onCancel = () => {
            UI.modalOverlay.classList.remove('active');
            cleanup();
            resolve(false);
        };
        
        const cleanup = () => {
            UI.modalConfirmBtn.removeEventListener('click', onConfirm);
            UI.modalCancelBtn.removeEventListener('click', onCancel);
        };
        
        UI.modalConfirmBtn.addEventListener('click', onConfirm);
        UI.modalCancelBtn.addEventListener('click', onCancel);
    });
}

function customPrompt(message, defaultValue = '', title = 'Input') {
    return new Promise(resolve => {
        UI.modalTitle.textContent = title;
        UI.modalMessage.innerHTML = message.replace(/\n/g, '<br>');
        UI.modalInput.value = defaultValue;
        UI.modalInput.style.display = 'block';
        UI.modalCancelBtn.style.display = 'block';
        
        UI.modalOverlay.classList.add('active');
        UI.modalInput.focus();
        if (defaultValue) UI.modalInput.select();
        
        const onConfirm = () => {
            const val = UI.modalInput.value;
            UI.modalOverlay.classList.remove('active');
            cleanup();
            resolve(val);
        };
        
        const onCancel = () => {
            UI.modalOverlay.classList.remove('active');
            cleanup();
            resolve(null);
        };
        
        const cleanup = () => {
            UI.modalConfirmBtn.removeEventListener('click', onConfirm);
            UI.modalCancelBtn.removeEventListener('click', onCancel);
        };
        
        UI.modalConfirmBtn.addEventListener('click', onConfirm);
        UI.modalCancelBtn.addEventListener('click', onCancel);
    });
}

// --- UTILS ---
let toastTimeout;
function showToast(msg) {
    UI.toast.textContent = msg;
    UI.toast.classList.add('show');

    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    toastTimeout = setTimeout(() => UI.toast.classList.remove('show'), 2000);
}

function checkInstallPrompt() {
    // Simple check if running in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (!isStandalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        UI.installPrompt.style.display = 'block';
    }
}

// --- SERVICE WORKER (PWA) ---
if ('serviceWorker' in navigator) {
    const swCode = `
                const CACHE_NAME = 'pos-v2';
                self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
                self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
                self.addEventListener('fetch', e => {
                    e.respondWith(
                        fetch(e.request).catch(() => caches.match(e.request))
                    );
                });
            `;
    const blob = new Blob([swCode], { type: 'application/javascript' });
    const swUrl = URL.createObjectURL(blob);
    navigator.serviceWorker.register(swUrl)
        .then(() => console.log('SW Registered'))
        .catch(err => console.log('SW Fail', err));
}

// Start App
init();
