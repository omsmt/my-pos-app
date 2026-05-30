// --- STATE MANAGEMENT ---
const STATE = {
    cart: JSON.parse(localStorage.getItem('pos_cart') || '[]'),
    sales: JSON.parse(localStorage.getItem('pos_sales') || '[]'),
    drafts: JSON.parse(localStorage.getItem('pos_drafts') || '[]'),
    inventory: [],
    lastId: parseInt(localStorage.getItem('pos_last_id') || '0'),
    deviceId: localStorage.getItem('pos_device_id') || 'POS1'
};

// --- BUNDLE PRESETS ---
const BUNDLES = [
    {
        sku: 'BDL-001',
        name: '5 for $20',
        description: '5 Keytags / Pins / Lanyards',
        eligibleDesc: 'Keytags • Pins • Lanyards',
        eligibleCategories: ['Keytags', 'Pins'],
        category: 'Bundle',
        bundleQty: 5,
        price: 20,
        isBundle: true
    }
];

// --- DOM ELEMENTS ---
const UI = {
    skuSearch: document.getElementById('skuSearch'),
    searchClear: document.getElementById('searchClear'),
    scanBtn: document.getElementById('scanBtn'),
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
    bundleSavingsRow: document.getElementById('bundleSavingsRow'),
    bundleSavings: document.getElementById('bundleSavings'),
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
    headerRevenue: document.getElementById('headerRevenue'),
    exportBtn: document.getElementById('exportBtn'),
    resetBtn: document.getElementById('resetBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    summaryBtn: document.getElementById('summaryBtn'),
    summarySection: document.getElementById('summarySection'),
    toast: document.getElementById('toast'),
    installPrompt: document.getElementById('installPrompt'),
    searchModeTab: document.getElementById('searchModeTab'),
    manualModeTab: document.getElementById('manualModeTab'),
    searchMode: document.getElementById('searchMode'),
    manualMode: document.getElementById('manualMode'),
    manualDesc: document.getElementById('manualDesc'),
    manualPrice: document.getElementById('manualPrice'),
    // Custom modal
    modalOverlay: document.getElementById('modalOverlay'),
    modalCard: document.getElementById('modalCard'),
    modalTitle: document.getElementById('modalTitle'),
    modalMessage: document.getElementById('modalMessage'),
    modalInput: document.getElementById('modalInput'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    modalConfirmBtn: document.getElementById('modalConfirmBtn'),
    // Review modal
    reviewModal: document.getElementById('reviewModal'),
    reviewItemsList: document.getElementById('reviewItemsList'),
    reviewTotal: document.getElementById('reviewTotal'),
    reviewPaymentBadge: document.getElementById('reviewPaymentBadge'),
    reviewCancelBtn: document.getElementById('reviewCancelBtn'),
    reviewConfirmBtn: document.getElementById('reviewConfirmBtn'),
    // Scan modal
    scanModal: document.getElementById('scanModal'),
    scanVideo: document.getElementById('scanVideo'),
    scanStatus: document.getElementById('scanStatus'),
    scanCancelBtn: document.getElementById('scanCancelBtn')
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
        showToast('⚠️ Could not load inventory — check your connection');
    }
}

async function init() {
    await loadInventory();
    renderInventorySelect();
    renderCart();
    renderDrafts();
    renderSales();
    checkInstallPrompt();

    if (STATE.cart.length > 0) {
        UI.cartSection.style.display = 'block';
    }
}

// --- BUNDLES ---
let bundlePromptPending = false;
let bundleTiersPrompted = {};
let bundleTiersApplied = {};

function checkBundleOpportunity() {
    if (bundlePromptPending) return;

    for (const bundle of BUNDLES) {
        const eligibleItems = STATE.cart.filter(item =>
            bundle.eligibleCategories.includes(item.category));
        const eligibleQty = eligibleItems.reduce((sum, i) => sum + i.quantity, 0);
        const currentTier = Math.floor(eligibleQty / bundle.bundleQty);
        const lastTier = bundleTiersPrompted[bundle.sku] || 0;

        if (currentTier === 0 || currentTier <= lastTier) continue;

        const eligibleSubtotal = eligibleItems.reduce((sum, i) => sum + i.lineTotal, 0);
        const bundleEligibleTotal = currentTier * bundle.price;
        const savings = eligibleSubtotal - bundleEligibleTotal;

        if (savings <= 0) continue;

        const label = currentTier > 1 ? `${currentTier}× "${bundle.name}"` : `"${bundle.name}"`;
        bundlePromptPending = true;
        customConfirm(
            `${eligibleQty} eligible items detected.\nApply ${label}?\n\nRegular: $${eligibleSubtotal.toFixed(2)} → Bundle: $${bundleEligibleTotal.toFixed(2)} (save $${savings.toFixed(2)})`,
            'Bundle Deal Available'
        ).then(confirmed => {
            bundlePromptPending = false;
            bundleTiersPrompted[bundle.sku] = currentTier;
            if (confirmed) {
                bundleTiersApplied[bundle.sku] = currentTier;
                updateTotals();
                showToast('Bundle deal applied! 🎉');
            }
        });
        break;
    }
}

function isItemInActiveBundle(item) {
    for (const bundle of BUNDLES) {
        if (bundle.eligibleCategories.includes(item.category)) {
            if ((bundleTiersApplied[bundle.sku] || 0) > 0) return true;
        }
    }
    return false;
}

// --- INVENTORY & SEARCH ---

function buildStockCache() {
    const soldMap = {};
    STATE.sales.forEach(sale => {
        sale.items.forEach(item => {
            soldMap[item.sku] = (soldMap[item.sku] || 0) + item.quantity;
        });
    });
    const cartMap = {};
    STATE.cart.forEach(item => {
        cartMap[item.sku] = (cartMap[item.sku] || 0) + item.quantity;
    });
    return { soldMap, cartMap };
}

function renderInventorySelect(items = STATE.inventory) {
    const { soldMap, cartMap } = buildStockCache();

    // Sort: available items first, OOS at bottom
    const sorted = [...items].sort((a, b) => {
        const stockA = a.quantity == null ? 999 : Math.max(0, a.quantity - (soldMap[a.sku] || 0) - (cartMap[a.sku] || 0));
        const stockB = b.quantity == null ? 999 : Math.max(0, b.quantity - (soldMap[b.sku] || 0) - (cartMap[b.sku] || 0));
        if (stockA === 0 && stockB !== 0) return 1;
        if (stockA !== 0 && stockB === 0) return -1;
        return 0;
    });

    UI.skuSelect.innerHTML = '<option value="">Select from list...</option>';

    for (const item of sorted) {
        const stock = item.quantity == null
            ? null
            : Math.max(0, item.quantity - (soldMap[item.sku] || 0) - (cartMap[item.sku] || 0));
        const isOOS = stock === 0;
        const isLow = stock !== null && stock > 0 && stock <= 2;

        const option = document.createElement('option');
        option.value = item.sku;
        option.textContent = `${item.sku} — ${item.description}${isOOS ? ' [OOS]' : isLow ? ` [${stock} left]` : ''}`;
        if (isOOS) option.style.color = '#4a5568';
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
        UI.previewStock.innerHTML = '<span class="stock-none">—</span>';
    } else if (stock === 0) {
        UI.previewStock.innerHTML = '<span class="stock-badge stock-out">Out of Stock</span>';
    } else if (stock <= 2) {
        UI.previewStock.innerHTML = `<span class="stock-badge stock-low">⚠ ${stock} left</span>`;
    } else {
        UI.previewStock.innerHTML = `<span class="stock-badge stock-ok">${stock} in stock</span>`;
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
        UI.previewCost.textContent = selectedItem.cost != null ? `$${selectedItem.cost.toFixed(2)}` : '—';
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
    UI.manualDesc.value = '';
    UI.manualPrice.value = '';
}

// --- MODE TOGGLE ---
UI.searchModeTab.addEventListener('click', () => {
    isManualMode = false;
    UI.searchModeTab.classList.add('active');
    UI.manualModeTab.classList.remove('active');
    UI.searchMode.style.display = 'block';
    UI.manualMode.style.display = 'none';
    resetSelection();
    checkAddButton();
});

UI.manualModeTab.addEventListener('click', () => {
    isManualMode = true;
    UI.manualModeTab.classList.add('active');
    UI.searchModeTab.classList.remove('active');
    UI.manualMode.style.display = 'block';
    UI.searchMode.style.display = 'none';
    resetSelection();
    checkAddButton();
});

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
    showToast('Added to cart');
    checkBundleOpportunity();
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
    UI.cartList.innerHTML = STATE.cart.map((item, idx) => {
        const inBundle = isItemInActiveBundle(item);
        const isManual = item.sku === 'MANUAL';
        return `
        <div class="cart-item${inBundle ? ' bundle-item' : ''}">
            <div class="cart-item-details">
                <div class="cart-item-title">${item.description}</div>
                <div class="cart-item-meta">
                    <span>${item.sku}</span>
                    <span>${item.quantity}×</span>
                    <span>$</span><input type="number" class="cart-price-input"
                        value="${item.unitPrice.toFixed(2)}"
                        onchange="updateCartPrice(${idx}, this.value)"
                        onclick="this.select()"
                        inputmode="decimal">
                    ${inBundle ? '<span class="chip chip-bundle">Bundle</span>' : ''}
                    ${isManual ? '<span class="chip chip-manual">Manual</span>' : ''}
                </div>
            </div>
            <div class="cart-item-price">$${item.lineTotal.toFixed(2)}</div>
            <button class="cart-remove" onclick="removeFromCart(${idx})">×</button>
        </div>`;
    }).join('');

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
        renderCart();
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
    bundleTiersPrompted = {};
    bundleTiersApplied = {};
    saveCart();
    renderCart();
}

// --- DRAFTS ---
UI.saveDraftBtn.addEventListener('click', async () => {
    const name = await customPrompt('Enter a name for this draft (e.g. Customer Name):');
    if (name === null) return;

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
        <div class="draft-item">
            <div>
                <div class="draft-title">${draft.name}</div>
                <div class="draft-meta">
                    ${new Date(draft.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    &bull; ${itemCount} items &bull; $${total.toFixed(2)}
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-sm btn-primary" onclick="loadDraft(${idx})">Load</button>
                <button class="cart-remove" onclick="deleteDraft(${idx})">×</button>
            </div>
        </div>`;
    }).join('');
}

window.loadDraft = async function (idx) {
    if (STATE.cart.length > 0) {
        if (!(await customConfirm('Current cart is not empty. Overwrite with draft?'))) return;
    }

    const draft = STATE.drafts[idx];
    STATE.cart = [...draft.items];
    UI.dealPrice.value = draft.dealPrice || '';

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
function computeBundleSavings() {
    let savings = 0;
    for (const bundle of BUNDLES) {
        const appliedTier = bundleTiersApplied[bundle.sku] || 0;
        if (appliedTier === 0) continue;

        const eligibleItems = STATE.cart.filter(i => bundle.eligibleCategories.includes(i.category));
        const eligibleQty = eligibleItems.reduce((s, i) => s + i.quantity, 0);
        const eligibleSubtotal = eligibleItems.reduce((s, i) => s + i.lineTotal, 0);
        if (eligibleQty === 0) continue;

        const activeTier = Math.min(appliedTier, Math.floor(eligibleQty / bundle.bundleQty));
        if (activeTier === 0) continue;

        const coveredFraction = (activeTier * bundle.bundleQty) / eligibleQty;
        const regularForCovered = eligibleSubtotal * coveredFraction;
        savings += Math.max(0, regularForCovered - activeTier * bundle.price);
    }
    return savings;
}

function updateTotals() {
    const subtotal = STATE.cart.reduce((sum, item) => sum + item.lineTotal, 0);
    UI.cartSubtotal.textContent = `$${subtotal.toFixed(2)}`;

    const dealVal = parseFloat(UI.dealPrice.value);
    if (!isNaN(dealVal) && dealVal >= 0) {
        UI.bundleSavingsRow.style.display = 'none';
        UI.cartTotal.textContent = `$${dealVal.toFixed(2)}`;
    } else {
        const bundleSavings = computeBundleSavings();
        if (bundleSavings > 0) {
            UI.bundleSavings.textContent = `-$${bundleSavings.toFixed(2)}`;
            UI.bundleSavingsRow.style.display = 'flex';
            UI.cartTotal.textContent = `$${(subtotal - bundleSavings).toFixed(2)}`;
        } else {
            UI.bundleSavingsRow.style.display = 'none';
            UI.cartTotal.textContent = `$${subtotal.toFixed(2)}`;
        }
    }

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

// Checkout opens review modal first
UI.checkoutBtn.addEventListener('click', () => {
    const subtotal = STATE.cart.reduce((sum, item) => sum + item.lineTotal, 0);
    const dealVal = parseFloat(UI.dealPrice.value);
    const manualDeal = !isNaN(dealVal) && dealVal >= 0;
    const bundleSavings = computeBundleSavings();
    const finalTotal = manualDeal ? dealVal : subtotal - bundleSavings;

    // Populate review modal
    UI.reviewItemsList.innerHTML = STATE.cart.map(item => `
        <div class="review-item-row">
            <strong>${item.quantity}× ${item.description}</strong>
            <span>$${item.lineTotal.toFixed(2)}</span>
        </div>`).join('');

    if ((manualDeal || bundleSavings > 0) && finalTotal !== subtotal) {
        UI.reviewItemsList.innerHTML += `
        <div class="review-item-row" style="color: var(--success);">
            <strong>Discount</strong>
            <span>-$${(subtotal - finalTotal).toFixed(2)}</span>
        </div>`;
    }

    UI.reviewTotal.textContent = `$${finalTotal.toFixed(2)}`;

    const paymentLabels = { cash: '💵 Cash', payid: '📱 PayID' };
    UI.reviewPaymentBadge.textContent = paymentLabels[selectedPayment] || selectedPayment;

    UI.reviewModal.classList.add('active');
});

UI.reviewCancelBtn.addEventListener('click', () => {
    UI.reviewModal.classList.remove('active');
});

UI.reviewConfirmBtn.addEventListener('click', () => {
    UI.reviewModal.classList.remove('active');
    completeSale();
});

function completeSale() {
    const subtotal = STATE.cart.reduce((sum, item) => sum + item.lineTotal, 0);
    const dealVal = parseFloat(UI.dealPrice.value);
    const manualDeal = !isNaN(dealVal) && dealVal >= 0;
    const bundleSavings = computeBundleSavings();
    const isDeal = manualDeal || bundleSavings > 0;
    const finalTotal = manualDeal ? dealVal : subtotal - bundleSavings;

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

    clearCart();
    renderSales();
    showToast('Sale recorded! ✓');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- SALES HISTORY ---
function updateHeaderRevenue() {
    const revenue = STATE.sales.reduce((sum, s) => sum + s.total, 0);
    UI.headerRevenue.textContent = `$${revenue.toFixed(2)}`;
}

function renderSales() {
    updateHeaderRevenue();

    if (summaryVisible) renderProductSummary();
    UI.totalCount.textContent = STATE.sales.length;
    const revenue = STATE.sales.reduce((sum, s) => sum + s.total, 0);
    UI.totalRevenue.textContent = `$${revenue.toFixed(2)}`;

    if (STATE.sales.length === 0) {
        UI.salesList.innerHTML = `
        <div class="empty-state">
            <span class="empty-icon">🛒</span>
            No sales yet today
        </div>`;
        return;
    }

    UI.salesList.innerHTML = STATE.sales.map(sale => `
        <div class="sale-record-wrapper">
            <div class="sale-record">
                <div class="sale-info">
                    <h4>#${sale.id} &bull; ${sale.items.length} item${sale.items.length !== 1 ? 's' : ''}</h4>
                    <div class="sale-meta">
                        ${new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        &bull; ${sale.paymentMethod.toUpperCase()}
                        ${sale.isDeal ? '&bull; DEAL' : ''}
                    </div>
                </div>
                <div class="sale-actions">
                    <div class="sale-amount">$${sale.total.toFixed(2)}</div>
                    <button class="btn btn-sm btn-ghost" onclick="toggleSaleDetails('${sale.id}')">View</button>
                    <button class="cart-remove" onclick="deleteSale('${sale.id}')">×</button>
                </div>
            </div>
            <div class="sale-details" id="sale-details-${sale.id}">
                ${sale.items.map(item => `
                    <div class="sale-detail-row">
                        <span>${item.quantity}× <em style="color:var(--text-dim);">[${item.sku}]</em> ${item.description}</span>
                        <strong>$${item.actualPrice.toFixed(2)}</strong>
                    </div>
                `).join('')}
                <div class="sale-pay-controls">
                    <span style="font-size:12px; color:var(--text-muted);">Payment: <strong>${sale.paymentMethod.toUpperCase()}</strong></span>
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-sm btn-ghost" style="font-size:11px;" onclick="updateSalePayment('${sale.id}', 'cash')">Cash</button>
                        <button class="btn btn-sm btn-ghost" style="font-size:11px;" onclick="updateSalePayment('${sale.id}', 'payid')">PayID</button>
                    </div>
                </div>
            </div>
        </div>`).join('');
}

window.toggleSaleDetails = function (id) {
    const el = document.getElementById(`sale-details-${id}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
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
        showToast(`Device ID: ${STATE.deviceId}`);
    }
});

// --- PRODUCT SUMMARY ---
let summaryVisible = false;

UI.summaryBtn.addEventListener('click', () => {
    summaryVisible = !summaryVisible;
    UI.summarySection.style.display = summaryVisible ? 'block' : 'none';
    UI.summaryBtn.textContent = summaryVisible ? '📊 Hide' : '📊';
    if (summaryVisible) renderProductSummary();
});

function renderProductSummary() {
    if (STATE.sales.length === 0) {
        UI.summarySection.innerHTML = '<div class="empty-state">No sales to summarise</div>';
        return;
    }

    const productMap = {};
    let totalCash = 0, totalPayID = 0;

    STATE.sales.forEach(sale => {
        if (sale.paymentMethod === 'cash') totalCash += sale.total;
        else totalPayID += sale.total;

        sale.items.forEach(item => {
            const key = item.sku === 'MANUAL' ? `MANUAL__${item.description}` : item.sku;
            if (!productMap[key]) {
                productMap[key] = {
                    sku: item.sku,
                    description: item.description,
                    category: item.category,
                    qty: 0,
                    revenue: 0
                };
            }
            productMap[key].qty += item.quantity;
            productMap[key].revenue += item.actualPrice;
        });
    });

    const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = STATE.sales.reduce((sum, s) => sum + s.total, 0);

    const categoryMap = {};
    products.forEach(p => {
        if (!categoryMap[p.category]) categoryMap[p.category] = { qty: 0, revenue: 0 };
        categoryMap[p.category].qty += p.qty;
        categoryMap[p.category].revenue += p.revenue;
    });
    const categories = Object.entries(categoryMap).sort((a, b) => b[1].revenue - a[1].revenue);

    UI.summarySection.innerHTML = `
        <div style="font-weight:700; font-size:14px; margin-bottom:10px; color:var(--text);">Product Breakdown</div>
        <div style="margin-bottom:16px;">
            ${products.map(p => `
                <div class="summary-product-row">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:13px;">${p.description}</div>
                        <div style="color:var(--text-muted); font-size:11px; margin-top:1px;">${p.sku} &bull; ${p.category} &bull; Qty: <strong style="color:var(--text);">${p.qty}</strong></div>
                    </div>
                    <div style="text-align:right; margin-left:12px; flex-shrink:0;">
                        <div style="font-weight:700; font-size:13px;">$${p.revenue.toFixed(2)}</div>
                        <div style="color:var(--text-dim); font-size:11px;">${totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) : '0.0'}%</div>
                    </div>
                </div>`).join('')}
        </div>

        <div style="font-weight:700; font-size:14px; margin-bottom:8px; color:var(--text);">By Category</div>
        <div style="margin-bottom:16px;">
            ${categories.map(([cat, data]) => `
                <div class="summary-product-row">
                    <span style="font-size:13px;">${cat} <span style="color:var(--text-muted);">(${data.qty} sold)</span></span>
                    <span style="font-weight:700; font-size:13px;">$${data.revenue.toFixed(2)}</span>
                </div>`).join('')}
        </div>

        <div style="font-weight:700; font-size:14px; margin-bottom:8px; color:var(--text);">By Payment</div>
        <div style="font-size:13px;">
            <div class="summary-product-row">
                <span>💵 Cash</span><span style="font-weight:700;">$${totalCash.toFixed(2)}</span>
            </div>
            <div class="summary-product-row">
                <span>📱 PayID</span><span style="font-weight:700;">$${totalPayID.toFixed(2)}</span>
            </div>
        </div>`;
}

// --- EXPORT ---
UI.exportBtn.addEventListener('click', async () => {
    if (STATE.sales.length === 0) {
        customAlert('No sales to export');
        return;
    }

    function csvEscape(val) {
        const str = String(val ?? '');
        return (str.includes('"') || str.includes(',') || str.includes('\n'))
            ? `"${str.replace(/"/g, '""')}"`
            : str;
    }

    const paymentLabel = { cash: 'Cash', payid: 'PayID' };

    const headers = ['ID', 'Date', 'Time', 'SKU', 'Description', 'Category', 'Qty', 'Unit Price', 'List Total', 'Discount', 'Line Total', 'Tx Total', 'Payment', 'Is Deal'];
    const rows = [headers.join(',')];

    STATE.sales.forEach(sale => {
        const ts = new Date(sale.timestamp);
        const date = ts.toLocaleDateString('en-AU', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const time = ts.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });
        const payment = paymentLabel[sale.paymentMethod] || sale.paymentMethod;

        sale.items.forEach(item => {
            const listTotal = item.unitPrice * item.quantity;
            const discount = listTotal - item.actualPrice;
            rows.push([
                csvEscape(sale.id),
                csvEscape(date),
                csvEscape(time),
                csvEscape(item.sku),
                csvEscape(item.description),
                csvEscape(item.category),
                item.quantity,
                item.unitPrice.toFixed(2),
                listTotal.toFixed(2),
                discount.toFixed(2),
                item.actualPrice.toFixed(2),
                sale.total.toFixed(2),
                csvEscape(payment),
                sale.isDeal ? 'Yes' : 'No'
            ].join(','));
        });
    });

    const productMap = {};
    let totalCash = 0, totalPayID = 0;

    STATE.sales.forEach(sale => {
        if (sale.paymentMethod === 'cash') totalCash += sale.total;
        else totalPayID += sale.total;

        sale.items.forEach(item => {
            const key = item.sku === 'MANUAL' ? `MANUAL__${item.description}` : item.sku;
            if (!productMap[key]) {
                productMap[key] = { sku: item.sku, description: item.description, category: item.category, qty: 0, revenue: 0 };
            }
            productMap[key].qty += item.quantity;
            productMap[key].revenue += item.actualPrice;
        });
    });

    const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = STATE.sales.reduce((sum, s) => sum + s.total, 0);

    const categoryMap = {};
    products.forEach(p => {
        if (!categoryMap[p.category]) categoryMap[p.category] = { qty: 0, revenue: 0 };
        categoryMap[p.category].qty += p.qty;
        categoryMap[p.category].revenue += p.revenue;
    });
    const categories = Object.entries(categoryMap).sort((a, b) => b[1].revenue - a[1].revenue);

    rows.push('');
    rows.push('--- PRODUCT SUMMARY ---');
    rows.push(['Description', 'SKU', 'Category', 'Qty Sold', 'Revenue', '% of Total'].join(','));
    products.forEach(p => {
        rows.push([
            csvEscape(p.description),
            csvEscape(p.sku),
            csvEscape(p.category),
            p.qty,
            p.revenue.toFixed(2),
            totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0.0%'
        ].join(','));
    });

    rows.push('');
    rows.push('--- CATEGORY TOTALS ---');
    rows.push(['Category', 'Qty Sold', 'Revenue'].join(','));
    categories.forEach(([cat, data]) => {
        rows.push([csvEscape(cat), data.qty, data.revenue.toFixed(2)].join(','));
    });

    rows.push('');
    rows.push('--- PAYMENT TOTALS ---');
    rows.push(['Method', 'Amount'].join(','));
    rows.push(['Cash', totalCash.toFixed(2)].join(','));
    rows.push(['PayID', totalPayID.toFixed(2)].join(','));
    rows.push(['Total', totalRevenue.toFixed(2)].join(','));

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-').substring(0, 5);
    const csvContent = rows.join('\n');
    const fileName = `sales_export_${dateStr}_${timeStr}.csv`;
    const file = new File([csvContent], fileName, { type: 'text/csv' });

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: 'Sales Export', text: 'Sales export CSV.' });
            return;
        } catch (err) {
            console.log('Share failed', err);
        }
    }

    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
});

// --- BARCODE SCAN ---
let scanStream = null;
let scanAnimFrame = null;
let barcodeDetector = null;

UI.scanBtn.addEventListener('click', openScanModal);
UI.scanCancelBtn.addEventListener('click', closeScanModal);

function openScanModal() {
    if (!('BarcodeDetector' in window)) {
        customAlert(
            'Barcode scanning is not supported in this browser.\n\nUse Chrome on Android or update your browser.\n\niOS Safari: use Chrome for iOS instead.',
            'Scanner Unavailable'
        );
        return;
    }

    UI.scanModal.classList.add('active');
    UI.scanStatus.textContent = 'Starting camera...';
    UI.scanStatus.classList.add('scanning');

    navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(stream => {
        scanStream = stream;
        UI.scanVideo.srcObject = stream;

        barcodeDetector = new BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'data_matrix'] });
        UI.scanStatus.textContent = 'Point camera at barcode...';

        scanAnimFrame = requestAnimationFrame(scanFrame);
    }).catch(err => {
        UI.scanStatus.textContent = 'Camera access denied.';
        UI.scanStatus.classList.remove('scanning');
        console.error('Camera error:', err);
    });
}

async function scanFrame() {
    if (!scanStream || !barcodeDetector) return;

    try {
        const barcodes = await barcodeDetector.detect(UI.scanVideo);
        if (barcodes.length > 0) {
            const code = barcodes[0].rawValue.trim().toUpperCase();
            handleScannedCode(code);
            return;
        }
    } catch (e) {
        // continue scanning
    }

    scanAnimFrame = requestAnimationFrame(scanFrame);
}

function handleScannedCode(code) {
    closeScanModal();

    // Try exact SKU match first, then partial
    let match = STATE.inventory.find(i => i.sku.toUpperCase() === code);
    if (!match) {
        match = STATE.inventory.find(i => i.sku.toUpperCase().includes(code) || code.includes(i.sku.toUpperCase()));
    }

    if (match) {
        UI.skuSearch.value = match.sku;
        UI.searchClear.classList.add('visible');
        const filtered = STATE.inventory.filter(i => i.sku === match.sku);
        renderInventorySelect(filtered);
        UI.skuSelect.value = match.sku;
        selectItem(match.sku);
        showToast(`Found: ${match.description}`);
    } else {
        showToast(`SKU not found: ${code}`);
        UI.skuSearch.value = code;
        UI.searchClear.classList.add('visible');
        const filtered = STATE.inventory.filter(item =>
            item.sku.toLowerCase().includes(code.toLowerCase()) ||
            item.description.toLowerCase().includes(code.toLowerCase())
        );
        renderInventorySelect(filtered.length > 0 ? filtered : STATE.inventory);
    }
}

function closeScanModal() {
    UI.scanModal.classList.remove('active');
    if (scanAnimFrame) {
        cancelAnimationFrame(scanAnimFrame);
        scanAnimFrame = null;
    }
    if (scanStream) {
        scanStream.getTracks().forEach(t => t.stop());
        scanStream = null;
        UI.scanVideo.srcObject = null;
    }
    barcodeDetector = null;
}

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
        const cleanup = () => UI.modalConfirmBtn.removeEventListener('click', onConfirm);
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

        const onConfirm = () => { UI.modalOverlay.classList.remove('active'); cleanup(); resolve(true); };
        const onCancel  = () => { UI.modalOverlay.classList.remove('active'); cleanup(); resolve(false); };
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
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => UI.toast.classList.remove('show'), 2200);
}

function checkInstallPrompt() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (!isStandalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        UI.installPrompt.style.display = 'block';
    }
}

// --- SERVICE WORKER (PWA) ---
if ('serviceWorker' in navigator) {
    const swCode = `
        const CACHE_NAME = 'pos-v3';
        self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
        self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
        self.addEventListener('fetch', e => {
            e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
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
