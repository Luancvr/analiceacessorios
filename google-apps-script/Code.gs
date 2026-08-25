/**
 * ANALICE ACESSÓRIOS — BACKEND GOOGLE APPS SCRIPT
 *
 * 1) Abra a planilha usada pelo catálogo.
 * 2) Extensões > Apps Script.
 * 3) Cole este arquivo inteiro.
 * 4) Altere ADMIN_PASSWORD.
 * 5) Execute setup() UMA vez e autorize.
 * 6) Implante como Web App:
 *    - Executar como: você
 *    - Quem tem acesso: qualquer pessoa
 * 7) Copie a URL /exec e cole em admin/admin.js -> API_URL
 *
 * O backend:
 * - usa a mesma planilha do catálogo;
 * - cria/atualiza/exclui produtos;
 * - faz upload das imagens para uma pasta do Google Drive;
 * - grava a URL pública da imagem na coluna Imagem;
 * - guarda o ID do arquivo em ImagemID;
 * - cria IDs únicos para cada produto.
 */

const CONFIG = {
  SPREADSHEET_ID: '1QIgG7oeHhyIrdlzWAb5jv3Ru_305UJ0xoZniGgQGP9M',
  SHEET_NAME: 'Página1',
  IMAGE_FOLDER_NAME: 'Analice Catalogo',
  ADMIN_PASSWORD: 'ALTERE-ESTA-SENHA'
};

const REQUIRED_HEADERS = [
  'ID',
  'Nome',
  'Imagem',
  'ImagemID',
  'Descricao',
  'Preco',
  'Categoria',
  'Disponibilidade',
  'CriadoEm',
  'AtualizadoEm'
];

function setup() {
  const sheet = getSheet_();
  ensureHeaders_(sheet);

  const folder = getOrCreateImageFolder_();
  Logger.log('Pasta de imagens: ' + folder.getId());
  Logger.log('Planilha preparada: ' + sheet.getName());
}

function doGet() {
  return json_({
    ok: true,
    service: 'analice-catalogo',
    message: 'API online'
  });
}

function doPost(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    authorize_(params.password);

    switch (params.action) {
      case 'auth':
        return json_({ ok: true, message: 'Autenticado.' });

      case 'list':
        return json_({ ok: true, products: listProducts_() });

      case 'create':
        return json_({ ok: true, product: createProduct_(params) });

      case 'update':
        return json_({ ok: true, product: updateProduct_(params) });

      case 'delete':
        return json_({ ok: true, message: deleteProduct_(params.id) });

      default:
        throw new Error('Ação inválida.');
    }
  } catch (error) {
    return json_({
      ok: false,
      message: error.message || String(error)
    });
  }
}

function authorize_(password) {
  if (!password || password !== CONFIG.ADMIN_PASSWORD) {
    throw new Error('Senha administrativa inválida.');
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.getSheets()[0];
  if (!sheet) throw new Error('Aba da planilha não encontrada.');
  return sheet;
}

function ensureHeaders_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(value => String(value || '').trim());

  const headers = [...existing];

  REQUIRED_HEADERS.forEach(header => {
    if (!headers.some(existingHeader => normalize_(existingHeader) === normalize_(header))) {
      headers.push(header);
    }
  });

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function headerMap_(sheet) {
  ensureHeaders_(sheet);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};

  headers.forEach((header, index) => {
    map[normalize_(header)] = index;
  });

  return map;
}

function listProducts_() {
  const sheet = getSheet_();
  const map = headerMap_(sheet);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  return values.map(row => ({
    ID: cell_(row, map, 'ID'),
    Nome: cell_(row, map, 'Nome'),
    Imagem: cell_(row, map, 'Imagem'),
    ImagemID: cell_(row, map, 'ImagemID'),
    Descricao: cell_(row, map, 'Descricao'),
    Preco: cell_(row, map, 'Preco'),
    Categoria: cell_(row, map, 'Categoria'),
    Disponibilidade: cell_(row, map, 'Disponibilidade'),
    CriadoEm: cell_(row, map, 'CriadoEm'),
    AtualizadoEm: cell_(row, map, 'AtualizadoEm')
  })).filter(product => product.ID || product.Nome);
}

function createProduct_(params) {
  const sheet = getSheet_();
  const map = headerMap_(sheet);

  const product = {
    ID: Utilities.getUuid(),
    Nome: String(params.nome || '').trim(),
    Imagem: '',
    ImagemID: '',
    Descricao: String(params.descricao || '').trim(),
    Preco: String(params.preco || '').trim(),
    Categoria: String(params.categoria || '').trim(),
    Disponibilidade: String(params.disponibilidade || 'Disponível').trim(),
    CriadoEm: new Date(),
    AtualizadoEm: new Date()
  };

  validateProduct_(product);

  if (params.imageData) {
    const image = saveImage_(params.imageData, params.imageName, params.imageMime);
    product.Imagem = image.url;
    product.ImagemID = image.id;
  }

  writeProductRow_(sheet, map, product);
  return product;
}

function updateProduct_(params) {
  const id = String(params.id || '').trim();
  if (!id) throw new Error('ID do produto não informado.');

  const sheet = getSheet_();
  const map = headerMap_(sheet);
  const rowNumber = findRowById_(sheet, map, id);

  if (!rowNumber) throw new Error('Produto não encontrado.');

  const existing = readProductRow_(sheet, map, rowNumber);

  const product = {
    ...existing,
    Nome: String(params.nome || '').trim(),
    Descricao: String(params.descricao || '').trim(),
    Preco: String(params.preco || '').trim(),
    Categoria: String(params.categoria || '').trim(),
    Disponibilidade: String(params.disponibilidade || 'Disponível').trim(),
    AtualizadoEm: new Date()
  };

  validateProduct_(product);

  if (params.imageData) {
    if (existing.ImagemID) {
      trashFileSilently_(existing.ImagemID);
    }

    const image = saveImage_(params.imageData, params.imageName, params.imageMime);
    product.Imagem = image.url;
    product.ImagemID = image.id;
  }

  writeProductRow_(sheet, map, product, rowNumber);
  return product;
}

function deleteProduct_(id) {
  id = String(id || '').trim();
  if (!id) throw new Error('ID do produto não informado.');

  const sheet = getSheet_();
  const map = headerMap_(sheet);
  const rowNumber = findRowById_(sheet, map, id);

  if (!rowNumber) throw new Error('Produto não encontrado.');

  const existing = readProductRow_(sheet, map, rowNumber);

  if (existing.ImagemID) {
    trashFileSilently_(existing.ImagemID);
  }

  sheet.deleteRow(rowNumber);
  return 'Produto excluído.';
}

function validateProduct_(product) {
  if (!product.Nome) throw new Error('Informe o nome do produto.');
  if (!product.Preco) throw new Error('Informe o valor.');
  if (!product.Categoria) throw new Error('Informe a categoria.');
  if (!product.Disponibilidade) throw new Error('Informe a disponibilidade.');
}

function writeProductRow_(sheet, map, product, rowNumber) {
  const targetRow = rowNumber || Math.max(sheet.getLastRow() + 1, 2);
  const width = sheet.getLastColumn();
  const row = sheet.getRange(targetRow, 1, 1, width).getValues()[0];

  Object.keys(product).forEach(key => {
    const column = map[normalize_(key)];
    if (column !== undefined) row[column] = product[key];
  });

  sheet.getRange(targetRow, 1, 1, width).setValues([row]);
}

function readProductRow_(sheet, map, rowNumber) {
  const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];

  return {
    ID: cell_(row, map, 'ID'),
    Nome: cell_(row, map, 'Nome'),
    Imagem: cell_(row, map, 'Imagem'),
    ImagemID: cell_(row, map, 'ImagemID'),
    Descricao: cell_(row, map, 'Descricao'),
    Preco: cell_(row, map, 'Preco'),
    Categoria: cell_(row, map, 'Categoria'),
    Disponibilidade: cell_(row, map, 'Disponibilidade'),
    CriadoEm: cell_(row, map, 'CriadoEm'),
    AtualizadoEm: cell_(row, map, 'AtualizadoEm')
  };
}

function findRowById_(sheet, map, id) {
  const idColumn = map[normalize_('ID')];
  if (idColumn === undefined || sheet.getLastRow() < 2) return 0;

  const values = sheet.getRange(2, idColumn + 1, sheet.getLastRow() - 1, 1).getValues();

  for (let index = 0; index < values.length; index++) {
    if (String(values[index][0] || '').trim() === id) {
      return index + 2;
    }
  }

  return 0;
}

function saveImage_(dataUrl, originalName, mimeType) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Imagem inválida.');

  const mime = mimeType || match[1] || 'image/jpeg';
  const bytes = Utilities.base64Decode(match[2]);
  const extension = extensionFromMime_(mime);
  const nameBase = String(originalName || 'produto').replace(/\.[^/.]+$/, '');
  const fileName = `${nameBase}-${Utilities.getUuid().slice(0, 8)}.${extension}`;

  const blob = Utilities.newBlob(bytes, mime, fileName);
  const folder = getOrCreateImageFolder_();
  const file = folder.createFile(blob);

  // Catálogo público: arquivo visível por link.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    id: file.getId(),
    url: `https://drive.google.com/uc?export=view&id=${file.getId()}`
  };
}

function getOrCreateImageFolder_() {
  const folders = DriveApp.getFoldersByName(CONFIG.IMAGE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.IMAGE_FOLDER_NAME);
}

function trashFileSilently_(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (error) {
    // Se a imagem já não existir, não bloqueia a operação do produto.
  }
}

function extensionFromMime_(mime) {
  const value = String(mime || '').toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('webp')) return 'webp';
  return 'jpg';
}

function cell_(row, map, header) {
  const column = map[normalize_(header)];
  return column === undefined ? '' : row[column];
}

function normalize_(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
