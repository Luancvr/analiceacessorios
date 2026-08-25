// ============================================================
// CONFIGURAÇÃO DO PAINEL
// ============================================================
// Cole aqui a URL do Google Apps Script Web App.
// Exemplo:
// https://script.google.com/macros/s/XXXXXXXXXXXX/exec
const API_URL = 'https://script.google.com/macros/s/AKfycbygoY0cZ2XTc3eMw3NahYbJw0nZqKMR_dTBUo_h3xSUgOxOc2KGxK0Iwy9fWhNlsNm3/exec';

let adminPassword = '';
let products = [];
let pendingImageFile = null;
let pendingImageData = null;
let aiAnalyzing = false;

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  $('login-form').addEventListener('submit', handleLogin);
  $('new-product-button').addEventListener('click', () => openProductModal());
  $('refresh-button').addEventListener('click', loadProducts);
  $('product-form').addEventListener('submit', saveProduct);
  $('product-image').addEventListener('change', handleImageChange);
  $('analyze-image-button').addEventListener('click', analyzeCurrentImage);
  $('modal-close').addEventListener('click', closeProductModal);
  $('cancel-button').addEventListener('click', closeProductModal);
  $('delete-product-button').addEventListener('click', deleteCurrentProduct);
});

function apiReady() {
    if (
        API_URL &&
        API_URL.startsWith('https://script.google.com/macros/s/') &&
        API_URL.endsWith('/exec')
    ) {
        return true;
    }

    setLoginMessage('Configure corretamente a URL do Google Apps Script no arquivo admin/admin.js.');
    return false;
}

async function api(action, payload = {}) {
  if (!apiReady()) throw new Error('API não configurada.');

  const body = new URLSearchParams();
  body.set('action', action);
  body.set('password', adminPassword);

  Object.entries(payload).forEach(([key, value]) => {
    body.set(key, value ?? '');
  });

  const response = await fetch(API_URL, {
    method: 'POST',
    body
  });

  const data = await response.json();
  if (!data.ok) throw new Error(data.message || 'Erro na operação.');
  return data;
}

async function handleLogin(event) {
  event.preventDefault();

  adminPassword = $('admin-password').value;

  try {
    await api('auth');
    $('login-panel').classList.add('hidden');
    $('admin-app').classList.remove('hidden');
    setLoginMessage('');
    await loadProducts();
  } catch (error) {
    adminPassword = '';
    setLoginMessage(error.message || 'Senha inválida.');
  }
}

async function loadProducts() {
  try {
    setMessage('Carregando produtos...', 'info');

    const data = await api('list');
    products = data.products || [];

    renderProducts();
    renderCategoryOptions();
    setMessage(`${products.length} produto(s) carregado(s).`, 'success');
  } catch (error) {
    setMessage(error.message || 'Não foi possível carregar os produtos.', 'error');
  }
}

function renderProducts() {
  const body = $('products-body');

  if (!products.length) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="empty-table">Nenhum produto cadastrado.</td>
      </tr>`;
    return;
  }

  body.innerHTML = products.map(product => {
    const statusClass = normalize(product.Disponibilidade) === 'disponivel'
      ? 'available'
      : 'unavailable';

    return `
      <tr>
        <td>
          <div class="product-cell">
            ${product.Imagem ? `<img src="${escapeAttr(product.Imagem)}" alt="">` : '<div class="thumb-placeholder">—</div>'}
            <div>
              <strong>${escapeHtml(product.Nome || 'Sem nome')}</strong>
              <small>${escapeHtml(product.Descricao || '')}</small>
            </div>
          </div>
        </td>
        <td>${escapeHtml(product.Categoria || '—')}</td>
        <td>${escapeHtml(formatPrice(product.Preco || ''))}</td>
        <td><span class="status ${statusClass}">${escapeHtml(product.Disponibilidade || 'Disponível')}</span></td>
        <td>
          <div class="row-actions">
            <button class="small-button" onclick="editProduct('${escapeAttr(product.ID)}')">Editar</button>
            <button class="small-button" onclick="duplicateProduct('${escapeAttr(product.ID)}')">Duplicar</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderCategoryOptions() {
  const categories = [...new Set(
    products.map(p => String(p.Categoria || '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  $('category-options').innerHTML = categories
    .map(category => `<option value="${escapeAttr(category)}"></option>`)
    .join('');
}

function openProductModal(product = null) {
  $('product-form').reset();
  $('product-id').value = '';
  $('photo-preview').innerHTML = '<span>Sem foto</span>';
  $('delete-product-button').classList.add('hidden');
  pendingImageFile = null;
  pendingImageData = null;
  aiAnalyzing = false;
  setAIStatus('', '');

  const analyzeButton = $('analyze-image-button');
  if (analyzeButton) {
    analyzeButton.disabled = true;
  }

  if (product) {
    $('modal-title').textContent = 'Editar produto';
    $('product-id').value = product.ID || '';
    $('product-name').value = product.Nome || '';
    $('product-price').value = formatPrice(product.Preco || '');
    $('product-description').value = product.Descricao || '';
    $('product-category').value = product.Categoria || '';
    $('product-availability').value = normalize(product.Disponibilidade) === 'fora de estoque'
      ? 'Fora de estoque'
      : 'Disponível';

    if (product.Imagem) {
      $('photo-preview').innerHTML = `<img src="${escapeAttr(product.Imagem)}" alt="">`;
    }

    $('delete-product-button').classList.remove('hidden');
  } else {
    $('modal-title').textContent = 'Novo produto';
  }

  $('product-modal').classList.remove('hidden');
  $('product-modal').setAttribute('aria-hidden', 'false');
}

function closeProductModal() {
  $('product-modal').classList.add('hidden');
  $('product-modal').setAttribute('aria-hidden', 'true');
}

async function handleImageChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    setAIStatus('Selecione uma imagem válida.', 'error');
    return;
  }

  pendingImageFile = file;
  setAIStatus('Preparando imagem...', 'loading');

  try {
    pendingImageData = await resizeImage(file);

    $('photo-preview').innerHTML =
      `<img src="${pendingImageData}" alt="Prévia">`;

    const analyzeButton = $('analyze-image-button');
    analyzeButton.disabled = false;

    // Executa automaticamente ao adicionar uma foto.
    await analyzeCurrentImage();
  } catch (error) {
    console.error(error);
    setAIStatus('Não foi possível preparar a imagem.', 'error');
  }
}

async function analyzeCurrentImage() {
  if (!pendingImageData || aiAnalyzing) return;

  aiAnalyzing = true;

  const button = $('analyze-image-button');
  button.disabled = true;
  button.textContent = '✨ Analisando...';

  setAIStatus('A IA está analisando o produto...', 'loading');

  try {
    const categories = [...new Set(
      products
        .map(product => String(product.Categoria || '').trim())
        .filter(Boolean)
    )];

    const data = await api('analyzeImage', {
      imageData: pendingImageData,
      imageMime: 'image/jpeg',
      categories: JSON.stringify(categories)
    });

    const suggestion = data.suggestion || {};

    if (suggestion.nome) {
      $('product-name').value = suggestion.nome;
    }

    if (suggestion.descricao) {
      $('product-description').value = suggestion.descricao;
    }

    if (suggestion.categoria) {
      $('product-category').value = suggestion.categoria;
    }

    // Disponibilidade não pode ser inferida com segurança da foto.
    // Em produto novo, deixamos como Disponível; ao editar, preservamos
    // o status que já estava cadastrado.
    const productId = $('product-id').value.trim();

    if (!productId) {
      $('product-availability').value = 'Disponível';
    }

    const confidence = Number(suggestion.confianca_categoria);
    const confidenceText = Number.isFinite(confidence)
      ? ` Confiança da categoria: ${Math.round(confidence * 100)}%.`
      : '';

    setAIStatus(
      `Dados preenchidos. Revise antes de salvar.${confidenceText}`,
      'success'
    );
  } catch (error) {
    console.error('Erro na análise de IA:', error);
    setAIStatus(
      error.message || 'Não foi possível analisar a imagem.',
      'error'
    );
  } finally {
    aiAnalyzing = false;
    button.disabled = !pendingImageData;
    button.textContent = '✨ Preencher com IA';
  }
}

function setAIStatus(text, type = '') {
  const el = $('ai-status');
  if (!el) return;

  el.textContent = text;
  el.className = `ai-status ${type}`.trim();
}


async function resizeImage(file) {
  const dataUrl = await fileToDataURL(file);

  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const maxSize = 1600;
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Comprime antes de enviar ao Apps Script para reduzir muito o tamanho.
  return canvas.toDataURL('image/jpeg', 0.82);
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveProduct(event) {
  event.preventDefault();

  const id = $('product-id').value;
  const payload = {
    id,
    nome: $('product-name').value.trim(),
    preco: $('product-price').value.trim(),
    descricao: $('product-description').value.trim(),
    categoria: $('product-category').value.trim(),
    disponibilidade: $('product-availability').value
  };

  try {
    toggleForm(true);
    setMessage(id ? 'Salvando alterações...' : 'Cadastrando produto...', 'info');

    if (pendingImageData) {
      payload.imageData = pendingImageData;
      payload.imageName = pendingImageFile?.name || 'produto.jpg';
      payload.imageMime = 'image/jpeg';
    }

    await api(id ? 'update' : 'create', payload);

    closeProductModal();
    await loadProducts();
    setMessage(id ? 'Produto atualizado com sucesso.' : 'Produto cadastrado com sucesso.', 'success');
  } catch (error) {
    setMessage(error.message || 'Não foi possível salvar o produto.', 'error');
  } finally {
    toggleForm(false);
  }
}

async function deleteCurrentProduct() {
  const id = $('product-id').value;
  if (!id) return;

  const product = products.find(item => item.ID === id);
  const name = product?.Nome || 'este produto';

  if (!confirm(`Excluir "${name}" do catálogo?`)) return;

  try {
    toggleForm(true);
    setMessage('Excluindo produto...', 'info');
    await api('delete', { id });
    closeProductModal();
    await loadProducts();
    setMessage('Produto excluído.', 'success');
  } catch (error) {
    setMessage(error.message || 'Não foi possível excluir o produto.', 'error');
  } finally {
    toggleForm(false);
  }
}

function editProduct(id) {
  const product = products.find(item => item.ID === id);
  if (product) openProductModal(product);
}

function duplicateProduct(id) {
  const product = products.find(item => item.ID === id);
  if (!product) return;

  const copy = {
    ...product,
    ID: '',
    Nome: `${product.Nome || 'Produto'} — cópia`
  };

  openProductModal(copy);
}

function toggleForm(disabled) {
  document.querySelectorAll('#product-form input, #product-form textarea, #product-form select, #product-form button')
    .forEach(element => element.disabled = disabled);

  if (!disabled && !pendingImageData) {
    $('analyze-image-button').disabled = true;
  }
}

function setMessage(text, type = '') {
  const el = $('message');
  el.textContent = text;
  el.className = `message global-message ${type}`;
}

function setLoginMessage(text) {
  const el = $('login-message');
  el.textContent = text;
  el.className = 'message error';
}

function normalize(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseNumber(value) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');

  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatPrice(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
  const text = String(value).trim();
  if (text.includes('R$')) return text;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseNumber(text));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

window.editProduct = editProduct;
window.duplicateProduct = duplicateProduct;
