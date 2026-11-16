import { PHONE_REGIONS, phoneEditorValue, validatePhone } from "./phone.js";

const METHOD_LABELS = new Map([
  ["phone", "电话"],
  ["email", "邮箱"],
  ["social", "社交账号"],
  ["address", "地址"],
]);
const HEADER_TYPES = new Map([...METHOD_LABELS].map(([type, label]) => [label, type]));
const HEADER_PATTERN = /^(电话地区|电话|邮箱|社交账号|地址)(?:\s*([1-9]\d{0,4}))?$/;
const EMAIL_PATTERN = /^[\w.!#$%&'*+/=?^`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

function spreadsheetLibrary() {
  if (!globalThis.XLSX) throw new Error("Excel 组件未加载，请刷新页面后重试。");
  return globalThis.XLSX;
}

function groupMethods(contact) {
  const groups = new Map();
  for (const method of contact.methods) {
    if (!groups.has(method.type)) groups.set(method.type, []);
    groups.get(method.type).push(method);
  }
  return groups;
}

function exportPhone(method, row, label) {
  const checked = validatePhone(phoneEditorValue(method.value));
  if (checked.error) {
    throw new Error(`第 ${row} 行的「${label}」含旧格式号码，请在通讯录中将它改为 3–15 位数字后重新导出。`);
  }
  return checked.value;
}

export function downloadContactsWorkbook(contacts) {
  const xlsx = spreadsheetLibrary();
  const grouped = contacts.map(groupMethods);
  const slots = [];
  for (const [type, label] of METHOD_LABELS) {
    const copies = grouped.reduce((size, methods) => Math.max(size, methods.get(type)?.length ?? 0), 1);
    for (let slot = 0; slot < copies; slot += 1) {
      slots.push({ type, slot, label: `${label} ${slot + 1}` });
      if (type === "phone") slots.push({ type, slot, label: `电话地区 ${slot + 1}`, region: true });
    }
  }

  const rows = [["姓名", "收藏", ...slots.map(({ label }) => label)]];
  for (const [index, contact] of contacts.entries()) {
    const values = slots.map(({ type, slot, label, region }) => {
      const method = grouped[index].get(type)?.[slot];
      if (!method) return "";
      if (region) return method.region ?? "";
      return type === "phone" ? exportPhone(method, index + 2, label) : method.value;
    });
    rows.push([contact.name, contact.favorite ? "是" : "否", ...values]);
  }

  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 20 }, { wch: 10 }, ...slots.map(({ region }) => ({ wch: region ? 14 : 24 }))];
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, "联系人");
  xlsx.writeFile(book, "通讯录.xlsx", { bookType: "xlsx", compression: true });
}

function getSheetRows(sheet, xlsx) {
  const rows = new Map();
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    if (cell.f !== undefined || cell.F !== undefined) throw new Error(`${address} 含公式，请粘贴为值后重试。`);
    if (cell.t === "e" || cell.t === "d") throw new Error(`${address} 含错误值或日期，请改为文本。`);
    if (cell.v === undefined || String(cell.v).trim() === "") continue;

    const { r: row, c: column } = xlsx.utils.decode_cell(address);
    if (!rows.has(row)) rows.set(row, new Map());
    rows.get(row).set(column, cell);
  }
  return rows;
}

function columnKey(header) {
  if (header === "姓名" || header === "收藏") return header;
  const match = header.match(HEADER_PATTERN);
  return match ? `${match[1]} ${match[2] ?? 1}` : null;
}

function readColumns(header, xlsx) {
  const byIndex = new Map();
  const byKey = new Map();

  for (const [index, cell] of [...(header ?? [])].sort(([left], [right]) => left - right)) {
    const key = columnKey(String(cell.v).trim());
    const location = xlsx.utils.encode_cell({ r: 0, c: index });
    if (!key) throw new Error(`${location} 表头无法识别，请使用导出的表头格式。`);
    if (byKey.has(key)) throw new Error(`${location} 列与「${key}」重复，请保留一列。`);
    byIndex.set(index, key);
    byKey.set(key, index);
  }

  if (!byKey.has("姓名")) throw new Error("第一行需要包含「姓名」表头。");
  for (const key of byKey.keys()) {
    if (key.startsWith("电话地区 ") && !byKey.has(key.replace("地区", ""))) {
      throw new Error(`「${key}」需要配对的电话号码列。`);
    }
  }
  return { byIndex, byKey };
}

function parseContact(row, index, columns, xlsx) {
  const readText = (key) => String(row.get(columns.byKey.get(key))?.v ?? "").trim();
  const issue = (key, message) => {
    const address = xlsx.utils.encode_cell({ r: index, c: columns.byKey.get(key) });
    throw new Error(`${address} ${message}`);
  };

  for (const column of row.keys()) {
    if (!columns.byIndex.has(column)) {
      const address = xlsx.utils.encode_cell({ r: index, c: column });
      throw new Error(`${address} 所在列缺少表头。`);
    }
  }

  const name = readText("姓名");
  if (!name) issue("姓名", "请填写联系人姓名。");
  const favoriteText = readText("收藏").toLowerCase();
  const favorite = ["是", "true", "1", "yes"].includes(favoriteText);
  if (!favorite && !["", "否", "false", "0", "no"].includes(favoriteText)) {
    issue("收藏", "收藏列请填写「是」或「否」。");
  }

  const methods = [];
  for (const [column, key] of columns.byIndex) {
    const [label, slot] = key.split(" ");
    const type = HEADER_TYPES.get(label);
    if (!type) continue;

    let value = readText(key);
    if (type === "phone") {
      const regionKey = `电话地区 ${slot}`;
      const region = readText(regionKey).toUpperCase();
      if (region && !PHONE_REGIONS.has(region)) issue(regionKey, "请填写有效的国家或地区代码，例如 CN、IE 或 GB。");
      if (!value && region) issue(key, "填写电话地区后也需要填写电话号码。");
      if (!value) continue;

      const cell = row.get(column);
      const padded = cell.t === "n" && /^0+$/.test(cell.z ?? "") && /^\d+$/.test(cell.w ?? "");
      value = padded ? cell.w : String(cell.v);
      const checked = validatePhone(value);
      if (checked.error) issue(key, checked.error);
      methods.push({ type, value: checked.value, region });
    } else if (value) {
      if (type === "email" && !EMAIL_PATTERN.test(value)) issue(key, "请输入格式正确的邮箱地址。");
      methods.push({ type, value });
    }
  }

  return { name, favorite, methods };
}

export function parseContactsWorkbook(arrayBuffer) {
  const xlsx = spreadsheetLibrary();
  const signature = new Uint8Array(arrayBuffer, 0, Math.min(4, arrayBuffer.byteLength));
  if (signature.length < 4 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 3 || signature[3] !== 4) {
    throw new Error("请选择有效的 .xlsx 工作簿。");
  }

  let workbook;
  try {
    workbook = xlsx.read(arrayBuffer, { bookFiles: true, cellDates: true, cellFormula: true, cellHTML: false, cellNF: true });
  } catch {
    throw new Error("无法打开工作簿，请检查文件是否损坏或加密。");
  }
  if (!workbook.keys?.some((path) => path === "xl/workbook.xml")) {
    throw new Error("请选择有效的 .xlsx 工作簿。");
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("工作簿需要至少一张含联系人信息的工作表。");
  const rows = getSheetRows(sheet, xlsx);
  const columns = readColumns(rows.get(0), xlsx);
  rows.delete(0);

  return [...rows].sort(([left], [right]) => left - right)
    .map(([index, row]) => parseContact(row, index, columns, xlsx));
}
