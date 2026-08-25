// ============================================================
// CONFIGURAÇÃO
// ============================================================

// O catálogo usa UMA ÚNICA planilha publicada como CSV.
// As categorias são filtradas localmente pela coluna "Categoria".
const CATALOG_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1QIgG7oeHhyIrdlzWAb5jv3Ru_305UJ0xoZniGgQGP9M/export?format=csv&gid=0';

const CATEGORY_ALL_LABEL = 'Todos';

// IMPORTANTE: coloque aqui o WhatsApp da loja.
// Formato: código do país + DDD + número, somente números.
// Exemplo: 5571999999999
const WHATSAPP_NUMBER = '5573998055154';

// Texto inicial da mensagem enviada ao WhatsApp.
const WHATSAPP_INTRO = 'Olá! Gostaria de fazer um pedido com os seguintes produtos:';

let selectedProducts = [];
let allProducts = [];
let currentCategory = '';

// ============================================================
// DADOS DE EXEMPLO
// ============================================================

const EXAMPLE_PRODUCTS = [
    {
        Nome: 'Colar Dourado',
        Imagem: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600',
        Descricao: 'Colar delicado com acabamento dourado.',
        Preco: 'R$ 39,90',
        Categoria: 'Colares'
    },
    {
        Nome: 'Relógio Minimalista',
        Imagem: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=600',
        Descricao: 'Relógio elegante para uso diário.',
        Preco: 'R$ 129,90',
        Categoria: 'Relógios'
    },
    {
        Nome: 'Brinco Argola',
        Imagem: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600',
        Descricao: 'Argola leve e versátil.',
        Preco: 'R$ 29,90',
        Categoria: 'Brincos'
    }
];

function getExampleProducts() {
    return EXAMPLE_PRODUCTS;
}

// ============================================================
// GOOGLE SHEETS
// ============================================================

async function fetchProductsData() {
    try {
        showLoading(true);

        let products = [];

        try {
            const response = await fetch(CATALOG_SHEET_URL);
            if (!response.ok) throw new Error('Planilha não encontrada');

            const csvText = await response.text();
            products = parseCSV(csvText);
        } catch (error) {
            console.log('Usando dados de exemplo...', error);
            products = getExampleProducts();
        }

        if (products.length === 0) {
            throw new Error('Nenhum produto encontrado');
        }

        allProducts = products;
        initializeCategoryButtons();
        applyCategoryFilter();
        showLoading(false);
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        showError();
        showLoading(false);
    }
}

function normalizeCategory(value) {
    return String(value || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function applyCategoryFilter() {
    const filteredProducts = currentCategory
        ? allProducts.filter(product => {
            const productCategory = getProductValue(
                product,
                'Categoria',
                'categoria',
                'CATEGORIA'
            );
            return normalizeCategory(productCategory) === normalizeCategory(currentCategory);
        })
        : allProducts;

    displayProducts(filteredProducts, false);
}

function parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]).map(header => header.trim());
    const products = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);

        if (values.length === headers.length) {
            const product = {};
            headers.forEach((header, index) => {
                product[header] = values[index].trim();
            });
            products.push(product);
        }
    }

    return products;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

// ============================================================
// PRODUTOS / CARDS
// ============================================================

function displayProducts(products, resetCart = false) {
    const grid = document.getElementById('products-grid');
    grid.innerHTML = '';

    if (resetCart) {
        selectedProducts = [];
    }

    products.forEach((product, index) => {
        const productCard = eProductCard(product, index);
        grid.appendChild(productCard);
    });

    products.forEach(product => {
        const productName = getProductValue(
            product,
            'Nome',
            'nome',
            'Produto',
            'produto'
        ) || 'Produto sem nome';

        updateVisibleCardsForProduct(productName);
    });

    updateCartUI();
    updateCartModal();
}

function getProductValue(product, ...keys) {
    for (const key of keys) {
        if (product[key] !== undefined && product[key] !== null && String(product[key]).trim() !== '') {
            return String(product[key]).trim();
        }
    }
    return '';
}


function normalizeAvailability(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function getProductAvailability(product) {
    const raw = getProductValue(
        product,
        'Disponibilidade',
        'disponibilidade',
        'Status',
        'status',
        'Estoque',
        'estoque',
        'Disponível',
        'disponivel',
        'Disponivel'
    );

    const normalized = normalizeAvailability(raw);

    // Vazio = disponível, para não quebrar produtos antigos que ainda
    // não possuem a coluna de disponibilidade.
    if (!raw) {
        return {
            available: true,
            label: 'Disponível',
            raw: ''
        };
    }

    const outOfStockValues = [
        'fora de estoque',
        'esgotado',
        'indisponivel',
        'indisponível',
        'sem estoque',
        'esgotada',
        'esgotado',
        '0',
        'false',
        'nao',
        'não'
    ];

    const availableValues = [
        'disponivel',
        'disponível',
        'em estoque',
        'disponivel para venda',
        'disponível para venda',
        'em estoque',
        'sim',
        'true',
        '1'
    ];

    if (outOfStockValues.includes(normalized)) {
        return {
            available: false,
            label: 'Fora de estoque',
            raw
        };
    }

    if (availableValues.includes(normalized)) {
        return {
            available: true,
            label: 'Disponível',
            raw
        };
    }

    // Permite utilizar a coluna com qualquer texto sem presumir
    // que um produto desconhecido esteja indisponível.
    return {
        available: true,
        label: raw,
        raw
    };
}

function createProductCard(product, index) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.animationDelay = `${index * 0.1}s`;

    const name = getProductValue(
        product,
        'Nome',
        'nome',
        'Produto',
        'produto'
    ) || 'Produto sem nome';

    const description = getProductValue(
        product,
        'Descricao',
        'Descrição',
        'descricao',
        'descrição',
        'Detalhes',
        'detalhes'
    ) || 'Descrição não disponível';

    const priceRaw = getProductValue(
        product,
        'Preco',
        'Preço',
        'preco',
        'preço'
    );

    const installments = getProductValue(
        product,
        'Parcelas',
        'parcelas'
    );

    const category = getProductValue(
        product,
        'Categoria',
        'categoria',
        'Tipo',
        'tipo'
    );

    const details = getProductValue(
        product,
        'Detalhes',
        'detalhes',
        'Cor',
        'cor',
        'Material',
        'material'
    );

    const availability = getProductAvailability(product);

    // ============================================================
    // IMAGEM
    // ============================================================

    const imageId = getProductValue(
        product,
        'ImagemID',
        'imagemid',
        'ImagemId',
        'imagemId'
    );

    let image = getProductValue(
        product,
        'Imagem',
        'imagem',
        'Foto',
        'foto'
    );

    // Se existir ImagemID, usa diretamente o thumbnail do Google Drive.
    if (imageId) {
        image = `https://drive.google.com/thumbnail?id=${encodeURIComponent(imageId)}&sz=w1200`;
    }

    // Compatibilidade com links antigos do Google Drive.
    // Converte automaticamente:
    // https://drive.google.com/uc?export=view&id=XXXXXXXX
    // para:
    // https://drive.google.com/thumbnail?id=XXXXXXXX&sz=w1200
    if (image && image.includes('drive.google.com')) {
        const idMatch = image.match(/[?&]id=([^&]+)/);

        if (idMatch && idMatch[1]) {
            image = `https://drive.google.com/thumbnail?id=${encodeURIComponent(idMatch[1])}&sz=w1200`;
        }
    }

    // Placeholder interno, sem depender de via.placeholder.com
    const imageFallback =
        'data:image/svg+xml;charset=UTF-8,' +
        encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg"
                 width="600"
                 height="500"
                 viewBox="0 0 600 500">
                <rect width="600" height="500" fill="#f3e7de"/>
                <text x="300"
                      y="245"
                      text-anchor="middle"
                      font-family="Arial, sans-serif"
                      font-size="24"
                      fill="#9a8174">
                    Sem imagem
                </text>
            </svg>
        `);

    // Se não houver imagem alguma, já começa com o fallback.
    if (!image) {
        image = imageFallback;
    }

    const productData = {
        ...product,
        _name: name,
        _image: image,
        _description: description,
        _price: priceRaw,
        _category: category,
        _details: details,
        _available: availability.available,
        _availabilityLabel: availability.label
    };

    card.dataset.productName = name;
    card.classList.toggle(
        'unavailable',
        !availability.available
    );

    card.innerHTML = `
        <div class="product-image-container">
            <img
                src="${escapeAttribute(image)}"
                alt="${escapeAttribute(name)}"
                class="product-image"
                onerror="this.onerror=null; this.src='${imageFallback}'"
            >

            ${
                category
                    ? `<span class="category-badge">${escapeHtml(category)}</span>`
                    : ''
            }

            <span class="availability-badge ${
                availability.available
                    ? 'is-available'
                    : 'is-unavailable'
            }">
                <i class="fas ${
                    availability.available
                        ? 'fa-circle-check'
                        : 'fa-circle-xmark'
                }"></i>
                ${escapeHtml(availability.label)}
            </span>
        </div>

        <div class="product-info">

            <h3 class="product-name">
                ${escapeHtml(name)}
            </h3>

            <p class="product-description">
                ${escapeHtml(description)}
            </p>

            ${
                details
                    ? `
                        <div class="product-detail">
                            <i class="fas fa-sparkles"></i>
                            <span>${escapeHtml(details)}</span>
                        </div>
                    `
                    : ''
            }

            <div class="product-price">
                ${
                    priceRaw
                        ? `
                            <div class="price-main">
                                ${escapeHtml(formatPrice(priceRaw))}
                            </div>
                        `
                        : ''
                }

                ${
                    installments
                        ? `
                            <div class="price-installments">
                                <i class="fas fa-credit-card"></i>
                                ${escapeHtml(installments)}
                            </div>
                        `
                        : ''
                }
            </div>

            <div
                class="cart-controls ${
                    availability.available ? '' : 'is-disabled'
                }"
                aria-label="Quantidade de ${escapeHtml(name)}"
            >
                <button
                    class="qty-button qty-minus"
                    type="button"
                    aria-label="Diminuir quantidade"
                    ${availability.available ? '' : 'disabled'}
                >
                    −
                </button>

                <span class="qty-value">
                    ${availability.available ? '0' : '—'}
                </span>

                <button
                    class="qty-button qty-plus"
                    type="button"
                    aria-label="Aumentar quantidade"
                    ${availability.available ? '' : 'disabled'}
                >
                    +
                </button>
            </div>

            <div
                class="select-product-label ${
                    availability.available
                        ? ''
                        : 'is-unavailable-label'
                }"
            >
                <i class="fas ${
                    availability.available
                        ? 'fa-cart-plus'
                        : 'fa-circle-xmark'
                }"></i>

                <span>
                    ${
                        availability.available
                            ? 'Adicionar ao carrinho'
                            : 'Produto indisponível'
                    }
                </span>
            </div>

        </div>
    `;

    const minusButton = card.querySelector('.qty-minus');
    const plusButton = card.querySelector('.qty-plus');

    minusButton.addEventListener('click', (event) => {
        event.stopPropagation();
        changeProductQuantity(
            productData,
            -1,
            card
        );
    });

    plusButton.addEventListener('click', (event) => {
        event.stopPropagation();
        changeProductQuantity(
            productData,
            1,
            card
        );
    });

    // Clique na imagem abre o lightbox.
    // Clique no restante do card adiciona 1 unidade.
    card.addEventListener('click', (event) => {

        if (event.target.closest('.qty-button')) {
            return;
        }

        if (event.target.closest('.product-image')) {
            openLightbox(
                image,
                name
            );
            return;
        }

        if (!availability.available) {
            return;
        }

        changeProductQuantity(
            productData,
            1,
            card
        );
    });

    return card;
}
function findCartItem(productName) {
    return selectedProducts.find(item => item.product._name === productName);
}

function getQuantity(productName) {
    const item = findCartItem(productName);
    return item ? item.quantity : 0;
}

function changeProductQuantity(product, delta, card) {
    if (product._available === false) return;

    const existingItem = findCartItem(product._name);
    const currentQuantity = existingItem ? existingItem.quantity : 0;
    const newQuantity = Math.max(0, currentQuantity + delta);

    if (!existingItem && newQuantity > 0) {
        selectedProducts.push({ product, quantity: newQuantity });
    } else if (existingItem && newQuantity > 0) {
        existingItem.quantity = newQuantity;
    } else if (existingItem && newQuantity === 0) {
        selectedProducts = selectedProducts.filter(item => item.product._name !== product._name);
    }

    if (card) updateProductCardQuantity(card, product._name);
    else updateVisibleCardsForProduct(product._name);

    updateCartUI();
    updateCartModal();
}

function updateProductCardQuantity(card, productName) {
    const quantity = getQuantity(productName);
    const qtyValue = card.querySelector('.qty-value');
    const label = card.querySelector('.select-product-label');

    card.classList.toggle('selected', quantity > 0);
    if (qtyValue) qtyValue.textContent = quantity;

    if (label) {
        const unavailable = card.classList.contains('unavailable');

        label.innerHTML = unavailable
            ? `<i class="fas fa-circle-xmark"></i><span>Produto indisponível</span>`
            : quantity > 0
                ? `<i class="fas fa-check-circle"></i><span>${quantity} ${quantity === 1 ? 'unidade no carrinho' : 'unidades no carrinho'}</span>`
                : `<i class="fas fa-cart-plus"></i><span>Adicionar ao carrinho</span>`;
    }
}

function updateVisibleCardsForProduct(productName) {
    document.querySelectorAll('.product-card').forEach(card => {
        if (card.dataset.productName === productName) {
            updateProductCardQuantity(card, productName);
        }
    });
}

function getCartItemCount() {
    return selectedProducts.reduce((total, item) => total + item.quantity, 0);
}

function parsePriceValue(priceString) {
    if (!priceString) return 0;

    if (typeof priceString === 'number') return priceString;

    const normalized = String(priceString)
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.');

    const number = parseFloat(normalized);
    return Number.isFinite(number) ? number : 0;
}

function getCartTotal() {
    return selectedProducts.reduce((total, item) => {
        return total + parsePriceValue(item.product._price) * item.quantity;
    }, 0);
}

function updateCartUI() {
    const count = getCartItemCount();
    const productTypes = selectedProducts.length;
    const total = getCartTotal();
    const countElement = document.getElementById('selected-count');
    const hintElement = document.getElementById('selection-hint');
    const button = document.getElementById('order-button');
    const totalElement = document.getElementById('cart-total');

    if (!countElement || !button) return;

    countElement.textContent = `${count} ${count === 1 ? 'item' : 'itens'} no carrinho`;
    hintElement.textContent = productTypes
        ? `${productTypes} ${productTypes === 1 ? 'produto' : 'produtos'} diferentes`
        : 'Adicione produtos para montar seu pedido';

    if (totalElement) {
        totalElement.textContent = total > 0 ? formatPrice(total) : '—';
    }

    button.disabled = count === 0;
}

function createWhatsAppMessage() {
    const lines = selectedProducts.map((item, index) => {
        const price = item.product._price ? formatPrice(item.product._price) : '';
        const subtotal = parsePriceValue(item.product._price) * item.quantity;
        const subtotalText = subtotal > 0 ? ` = ${formatPrice(subtotal)}` : '';
        const priceText = price ? ` — ${price} un.` : '';

        return `${index + 1}. ${item.product._name} | Qtd: ${item.quantity}${priceText}${subtotalText}`;
    });

    const total = getCartTotal();
    const totalLine = total > 0 ? `\nTotal estimado: ${formatPrice(total)}` : '';

    return `${WHATSAPP_INTRO}\n\n${lines.join('\n')}\n${totalLine}\n\nGostaria de confirmar a disponibilidade e finalizar o pedido.`;
}

function sendOrderToWhatsApp() {
    if (selectedProducts.length === 0) return;

    if (!/^\d{10,15}$/.test(WHATSAPP_NUMBER)) {
        alert('Configure o número do WhatsApp no arquivo script.js antes de fazer um pedido.');
        return;
    }

    const message = createWhatsAppMessage();
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
}

function openCartModal() {
    if (selectedProducts.length === 0) return;
    updateCartModal();
    const modal = document.getElementById('cart-modal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCartModal() {
    const modal = document.getElementById('cart-modal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

function updateCartModal() {
    const list = document.getElementById('cart-items');
    const totalElement = document.getElementById('cart-modal-total');
    const footerButton = document.getElementById('cart-whatsapp-button');

    if (!list) return;

    if (selectedProducts.length === 0) {
        list.innerHTML = '<div class="empty-cart"><i class="fas fa-bag-shopping"></i><p>Seu carrinho está vazio.</p></div>';
        if (totalElement) totalElement.textContent = 'R$ 0,00';
        if (footerButton) footerButton.disabled = true;
        return;
    }

    list.innerHTML = selectedProducts.map((item, index) => {
        const price = parsePriceValue(item.product._price);
        const subtotal = price * item.quantity;

        return `
            <div class="cart-item" data-cart-name="${escapeAttribute(item.product._name)}">
                <img src="${escapeAttribute(item.product._image)}" alt="${escapeAttribute(item.product._name)}" onerror="this.src='https://via.placeholder.com/100x100?text=Sem+Imagem'">
                <div class="cart-item-info">
                    <strong>${escapeHtml(item.product._name)}</strong>
                    ${price > 0 ? `<span>${formatPrice(price)} cada</span>` : ''}
                    <div class="cart-item-actions">
                        <button type="button" class="modal-qty-button" data-action="decrease" data-index="${index}">−</button>
                        <b>${item.quantity}</b>
                        <button type="button" class="modal-qty-button" data-action="increase" data-index="${index}">+</button>
                        ${subtotal > 0 ? `<em>${formatPrice(subtotal)}</em>` : ''}
                    </div>
                </div>
                <button type="button" class="remove-cart-item" data-index="${index}" aria-label="Remover ${escapeAttribute(item.product._name)}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');

    if (totalElement) totalElement.textContent = formatPrice(getCartTotal());
    if (footerButton) footerButton.disabled = false;
}

function handleCartModalClick(event) {
    const qtyButton = event.target.closest('.modal-qty-button');
    const removeButton = event.target.closest('.remove-cart-item');

    if (qtyButton) {
        const index = Number(qtyButton.dataset.index);
        const item = selectedProducts[index];
        if (!item) return;

        changeProductQuantity(item.product, qtyButton.dataset.action === 'increase' ? 1 : -1);
        return;
    }

    if (removeButton) {
        const index = Number(removeButton.dataset.index);
        const item = selectedProducts[index];
        if (!item) return;

        selectedProducts.splice(index, 1);
        updateVisibleCardsForProduct(item.product._name);
        updateCartUI();
        updateCartModal();
    }
}

// ============================================================
// PREÇOS / UTILITÁRIOS
// ============================================================

function formatPrice(priceValue) {
    if (priceValue === null || priceValue === undefined || priceValue === '') return '';

    // O carrinho também chama esta função com números já calculados.
    // A versão anterior tentava usar .includes() diretamente no valor,
    // causando um erro quando o valor era Number e interrompendo a atualização do carrinho.
    if (typeof priceValue === 'number') {
        if (!Number.isFinite(priceValue)) return '';

        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(priceValue);
    }

    const priceString = String(priceValue).trim();
    if (!priceString) return '';

    if (priceString.includes('R$')) return priceString;

    const normalized = priceString
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.');

    const number = parseFloat(normalized);
    if (isNaN(number)) return priceString;

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(number);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
    return escapeHtml(value);
}

// ============================================================
// LOADING / ERRO
// ============================================================

function showLoading(show) {
    const loading = document.getElementById('loading');
    const grid = document.getElementById('products-grid');
    const error = document.getElementById('error-message');

    if (show) {
        loading.style.display = 'block';
        grid.style.display = 'none';
        error.style.display = 'none';
    } else {
        loading.style.display = 'none';
        grid.style.display = 'grid';
    }
}

function showError() {
    const loading = document.getElementById('loading');
    const grid = document.getElementById('products-grid');
    const error = document.getElementById('error-message');

    loading.style.display = 'none';
    grid.style.display = 'none';
    error.style.display = 'block';
}

// ============================================================
// FILTROS POR CATEGORIA — MESMA PLANILHA
// ============================================================

function selectCategory(category, button) {
    currentCategory = category || '';

    document.querySelectorAll('.sheet-selection .btn').forEach(btn => {
        btn.classList.remove('active');
    });

    if (button) button.classList.add('active');

    applyCategoryFilter();
}

function initializeCategoryButtons() {
    const container = document.getElementById('sheet-selection');
    if (!container) return;

    container.innerHTML = '';

    const categories = Array.from(new Set(
        allProducts
            .map(product => getProductValue(product, 'Categoria', 'categoria', 'CATEGORIA'))
            .map(value => String(value || '').trim())
            .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const filters = [
        { label: CATEGORY_ALL_LABEL, category: '' },
        ...categories.map(category => ({ label: category, category }))
    ];

    filters.forEach(filter => {
        const button = document.createElement('button');
        button.className = 'btn';
        button.type = 'button';
        button.textContent = filter.label;
        button.dataset.category = filter.category;

        button.addEventListener('click', () => {
            selectCategory(filter.category, button);
        });

        container.appendChild(button);
    });

    const activeButton = Array.from(container.querySelectorAll('.btn')).find(
        btn => normalizeCategory(btn.dataset.category) === normalizeCategory(currentCategory)
    );

    (activeButton || container.querySelector('.btn'))?.classList.add('active');
}

function reloadProducts() {
    fetchProductsData();
}

window.reloadProducts = reloadProducts;

// ============================================================
// LIGHTBOX
// ============================================================

function openLightbox(imageSrc, productName) {
    const lightbox = document.getElementById('lightbox');
    const mainImg = document.getElementById('lightbox-main-img');

    mainImg.src = imageSrc;
    mainImg.alt = productName;

    lightbox.classList.add('active');
    searchRelatedImages(productName);

    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');

    document.body.style.overflow = 'auto';

    const carousel = document.getElementById('related-images-carousel');
    carousel.innerHTML = '';
}

async function searchRelatedImages(productName) {
    const carousel = document.getElementById('related-images-carousel');
    carousel.innerHTML = '<div style="color: #666; padding: 20px;">Buscando mais imagens...</div>';

    try {
        const relatedImages = [];
        for (let i = 1; i <= 6; i++) {
            relatedImages.push({
                src: `https://source.unsplash.com/200x200/?jewelry,accessory,${i}`,
                alt: `${productName} - Imagem ${i}`
            });
        }

        carousel.innerHTML = '';

        relatedImages.forEach((img, index) => {
            const imgElement = document.createElement('img');
            imgElement.src = img.src;
            imgElement.alt = img.alt;
            imgElement.onclick = () => changeMainImage(img.src, img.alt);
            imgElement.style.animationDelay = `${index * 0.1}s`;
            imgElement.style.animation = 'fadeInUp 0.5s ease forwards';
            carousel.appendChild(imgElement);
        });
    } catch (error) {
        console.error('Erro ao buscar imagens relacionadas:', error);
        carousel.innerHTML = '<div style="color: #666; padding: 20px;">Não foi possível carregar mais imagens.</div>';
    }
}

function changeMainImage(newSrc, newAlt) {
    const mainImg = document.getElementById('lightbox-main-img');

    mainImg.style.opacity = '0.5';

    setTimeout(() => {
        mainImg.src = newSrc;
        mainImg.alt = newAlt;
        mainImg.style.opacity = '1';
    }, 200);
}

function initializeLightbox() {
    const lightbox = document.getElementById('lightbox');
    const closeBtn = document.querySelector('.close-btn');

    closeBtn.addEventListener('click', closeLightbox);

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('active')) {
            closeLightbox();
        }
    });
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    fetchProductsData();
    initializeLightbox();

    document.getElementById('order-button').addEventListener('click', openCartModal);
    document.getElementById('cart-items').addEventListener('click', handleCartModalClick);
    document.getElementById('cart-whatsapp-button').addEventListener('click', sendOrderToWhatsApp);
    document.querySelector('.cart-modal-close').addEventListener('click', closeCartModal);
    document.getElementById('cart-modal').addEventListener('click', (event) => {
        if (event.target.id === 'cart-modal') closeCartModal();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.getElementById('cart-modal').classList.contains('active')) {
            closeCartModal();
        }
    });
});
