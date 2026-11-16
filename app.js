import { downloadContactsWorkbook, parseContactsWorkbook } from "./excel.js";
import { PHONE_REGIONS, phoneEditorValue, validatePhone } from "./phone.js";

const STORAGE_KEY = "assessment-2.contacts";
const METHOD_TYPES = new Map([
  ["phone", { label: "电话", field: "电话号码", input: "tel" }],
  ["email", { label: "邮箱", field: "邮箱地址", input: "email" }],
  ["social", { label: "社交账号", field: "平台和账号", input: "text" }],
  ["address", { label: "地址", field: "联系地址", input: "text" }],
]);

const form = document.querySelector("#contact-form");
const nameInput = form.elements.namedItem("name");
const editorHeading = document.querySelector("#editor-heading");
const methodList = document.querySelector("#method-list");
const methodTemplate = document.querySelector("#method-template");
const addMethodButton = document.querySelector("#add-method");
const saveButton = document.querySelector("#save-contact");
const cancelEditButton = document.querySelector("#cancel-edit");
const editorPanel = document.querySelector(".editor-panel");
const detailPanel = document.querySelector("#detail-panel");
const detailName = document.querySelector("#detail-name");
const detailList = document.querySelector("#detail-list");
const detailEdit = document.querySelector("#detail-edit");
const detailNew = document.querySelector("#detail-new");
const detailClose = document.querySelector("#detail-close");
const formStatus = document.querySelector("#form-status");
const directoryStatus = document.querySelector("#directory-status");
const list = document.querySelector("#contacts-list");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = document.querySelector("#empty-title");
const emptyHint = document.querySelector("#empty-hint");
const searchEmpty = document.querySelector("#search-empty");
const count = document.querySelector("#contact-count");
const search = document.querySelector("#search-input");
const showAll = document.querySelector("#show-all");
const showFavorites = document.querySelector("#show-favorites");
const importButton = document.querySelector("#import-excel");
const exportButton = document.querySelector("#export-excel");
const excelFile = document.querySelector("#excel-file");
const removeDialog = document.querySelector("#remove-contact-dialog");
const removeMessage = document.querySelector("#remove-contact-message");
const removeError = document.querySelector("#remove-contact-error");
const confirmRemove = document.querySelector("#confirm-remove-contact");
const originalMethods = new WeakMap();

let contacts = [];
let editingId = null;
let favoritesOnly = false;
let selectedId = null;
let formDirty = false;

function isValidContact(contact) {
  return (
    typeof contact?.id === "string" &&
    typeof contact.name === "string" &&
    (contact.favorite === undefined || typeof contact.favorite === "boolean") &&
    Array.isArray(contact.methods) &&
    contact.methods.every((method) =>
      METHOD_TYPES.has(method?.type) &&
      typeof method.value === "string" &&
      (method.region === undefined || method.region === "" || PHONE_REGIONS.has(method.region)),
    )
  );
}

function loadContacts() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const storedContacts = saved === null ? [] : JSON.parse(saved);

  if (!Array.isArray(storedContacts) || !storedContacts.every(isValidContact)) {
    throw new Error("Invalid stored contacts");
  }

  return storedContacts;
}

async function updateContacts(change) {
  const persist = () => {
    const updated = change(loadContacts());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    contacts = updated;
  };

  if (navigator.locks) {
    await navigator.locks.request(STORAGE_KEY, persist);
  } else {
    persist();
  }
}

function setStatus(message, state = "") {
  formStatus.textContent = message;
  formStatus.dataset.state = state;
}

function setDirectoryStatus(message = "", state = "error") {
  directoryStatus.textContent = message;
  directoryStatus.dataset.state = state;
  directoryStatus.hidden = !message;
}

function createElement(tag, className, text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function updateMethodFields(row) {
  const type = row.querySelector(".method-type").value;
  const config = METHOD_TYPES.get(type);
  const input = row.querySelector(".method-value");

  row.querySelector(".method-region-field").hidden = type !== "phone";
  row.querySelector(".method-value-label").textContent = config.field;
  input.type = config.input;
  input.inputMode = type === "phone" ? "numeric" : "";
  input.removeAttribute("aria-invalid");
}

function appendMethod(method, isExisting = false) {
  const row = methodTemplate.content.firstElementChild.cloneNode(true);
  const type = row.querySelector(".method-type");
  const region = row.querySelector(".method-region");

  for (const [id, details] of PHONE_REGIONS) {
    region.add(new Option(`${details.name} ${details.code}`, id));
  }

  type.value = method?.type ?? "phone";
  region.value = method?.region ?? "";
  updateMethodFields(row);

  if (method) {
    const input = row.querySelector(".method-value");
    input.value = method.type === "phone" ? phoneEditorValue(method.value) : method.value;
    input.dataset.digits = method.type === "phone" ? input.value : "";
    row.querySelector(".legacy-phone-note").hidden = !isExisting || method.type !== "phone" || Boolean(input.value);
    if (isExisting) originalMethods.set(row, method);
  }

  methodList.append(row);
  return row;
}

function resetEditor(contact = null) {
  selectedId = null;
  editorPanel.hidden = false;
  detailPanel.hidden = true;
  editingId = contact?.id ?? null;
  nameInput.value = contact?.name ?? "";
  nameInput.removeAttribute("aria-invalid");
  editorHeading.textContent = contact ? "编辑联系人" : "新增联系人";
  saveButton.textContent = contact ? "保存修改" : "添加联系人";
  cancelEditButton.hidden = !contact;
  methodList.replaceChildren();

  if (contact) {
    contact.methods.forEach((method) => appendMethod(method, true));
  }

  if (!contact?.methods.some((method) => method.type === "phone")) {
    appendMethod({ type: "phone", value: "" });
  }
  if (!contact?.methods.some((method) => method.type === "email")) {
    appendMethod({ type: "email", value: "" });
  }

  setStatus("");
  formDirty = false;
}

function canLeaveEditor() {
  return !formDirty || window.confirm("表单有未保存的修改，确认放弃这些修改？");
}

function showContact(contact) {
  selectedId = contact.id;
  editingId = null;
  formDirty = false;
  editorPanel.hidden = true;
  detailPanel.hidden = false;
  detailName.textContent = contact.name;
  const items = [];

  for (const method of contact.methods) {
    const item = createElement("div", "detail-item");
    const value = createElement("dd", "", displayMethodValue(method));
    const region = regionText(method);
    if (region) value.append(" ", createElement("span", "contact-region", `· ${region}`));
    item.append(createElement("dt", "", METHOD_TYPES.get(method.type).label), value);
    items.push(item);
  }

  if (!items.length) {
    const item = createElement("div", "detail-item");
    item.append(createElement("dt", "", "联系方式"), createElement("dd", "", "未填写"));
    items.push(item);
  }

  detailList.replaceChildren(...items);
  renderContacts();
}

function invalidField(input, message) {
  input.setAttribute("aria-invalid", "true");
  setStatus(message, "error");
  input.focus();
  return null;
}

function readContactForm() {
  const name = nameInput.value.trim();
  if (!name) {
    return invalidField(nameInput, "请输入联系人姓名。");
  }

  const methods = [];

  for (const row of methodList.children) {
    const type = row.querySelector(".method-type").value;
    const input = row.querySelector(".method-value");

    if (type === "phone") {
      if (input.dataset.rejectedCharacters) {
        return invalidField(input, "电话号码只允许输入 0–9。");
      }

      const region = row.querySelector(".method-region").value;
      const original = originalMethods.get(row);
      if (original?.type === type && phoneEditorValue(original.value) === input.value && (original.region ?? "") === region) {
        methods.push(original);
        continue;
      }

      if (!input.value) continue;

      const checked = validatePhone(input.value);

      if (checked.error) {
        return invalidField(input, checked.error);
      }

      methods.push({ type, value: checked.value, region });
      continue;
    }

    const value = input.value.trim();
    if (!value) continue;

    if (type === "email" && input.validity.typeMismatch) {
      return invalidField(input, "请输入格式正确的邮箱地址。");
    }

    methods.push({ type, value });
  }

  return { name, methods };
}

function regionText(method) {
  const region = PHONE_REGIONS.get(method.region);
  return region ? `${region.name} ${region.code}` : "";
}

function displayMethodValue(method) {
  return method.type === "phone" ? phoneEditorValue(method.value) || method.value : method.value;
}

function createCard(contact) {
  const card = createElement("article", "contact-card");
  const initials = Array.from(contact.name).slice(0, 2).join("").toUpperCase();
  const avatar = createElement("div", "contact-avatar", initials);
  const body = createElement("div", "contact-body");
  const actions = createElement("div", "card-actions");
  const select = createElement("button", "card-select");
  const edit = createElement("button", "card-action", "编辑");
  const favorite = createElement("button", "card-action", contact.favorite ? "★ 已收藏" : "☆ 收藏");
  const remove = createElement("button", "card-action", "删除");

  card.dataset.contactId = contact.id;
  select.type = "button";
  select.dataset.action = "select";
  select.setAttribute("aria-label", `查看 ${contact.name} 的信息`);
  select.setAttribute("aria-pressed", String(contact.id === selectedId));
  avatar.setAttribute("aria-hidden", "true");
  body.append(createElement("h3", "contact-name", contact.name));
  edit.type = "button";
  edit.dataset.action = "edit";
  edit.setAttribute("aria-label", `编辑 ${contact.name}`);
  favorite.type = "button";
  favorite.dataset.action = "favorite";
  favorite.setAttribute("aria-label", `收藏 ${contact.name}`);
  favorite.setAttribute("aria-pressed", String(Boolean(contact.favorite)));
  remove.type = "button";
  remove.dataset.action = "remove";
  remove.setAttribute("aria-label", `删除 ${contact.name}`);
  actions.append(favorite, edit, remove);

  if (contact.methods.length > 0) {
    const details = createElement("dl", "contact-details");

    for (const method of contact.methods) {
      const detail = createElement("div", "contact-detail");
      const value = createElement("dd", "contact-detail-value", displayMethodValue(method));
      const region = regionText(method);

      if (region) {
        value.append(" ", createElement("span", "contact-region", `· ${region}`));
      }

      detail.append(createElement("dt", "contact-detail-label", METHOD_TYPES.get(method.type).label), value);
      details.append(detail);
    }

    body.append(details);
  }

  select.append(avatar, body);
  card.append(select, actions);
  return card;
}

function renderContacts() {
  const query = search.value.trim().toLowerCase();
  const available = favoritesOnly ? contacts.filter((contact) => contact.favorite) : contacts;
  const matches = available.filter((contact) => {
    const fields = [contact.name, ...contact.methods.map((method) => `${displayMethodValue(method)} ${regionText(method)}`)];
    return fields.some((field) => field.toLowerCase().includes(query));
  });

  list.replaceChildren(...matches.map(createCard));
  list.hidden = matches.length === 0;
  count.textContent = String(matches.length);
  showAll.setAttribute("aria-pressed", String(!favoritesOnly));
  showFavorites.setAttribute("aria-pressed", String(favoritesOnly));
  emptyState.hidden = available.length > 0;
  emptyTitle.textContent = favoritesOnly ? "暂无收藏联系人" : "暂无联系人";
  emptyHint.textContent = favoritesOnly ? "在全部联系人中点击星标即可收藏。" : "添加第一位联系人后，即可在这里查看。";
  searchEmpty.hidden = available.length === 0 || matches.length > 0;
}

function refreshContacts() {
  try {
    contacts = loadContacts();
    setDirectoryStatus();
    if (selectedId) {
      const selected = contacts.find((contact) => contact.id === selectedId);
      if (selected) {
        showContact(selected);
      } else {
        resetEditor();
      }
    }
  } catch {
    setDirectoryStatus("无法读取已保存的联系人，请检查浏览器存储。");
  }

  renderContacts();
}

function selectFilter(onlyFavorites) {
  favoritesOnly = onlyFavorites;
  renderContacts();
}

function findCardButton(id, action) {
  return list.querySelector(`[data-contact-id="${CSS.escape(id)}"] [data-action="${action}"]`);
}

function createContactId() {
  return crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(4)).join("-");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saveButton.disabled) return;

  const fields = readContactForm();
  if (!fields) return;

  const id = editingId;
  saveButton.disabled = true;
  cancelEditButton.disabled = true;

  try {
    await updateContacts((saved) => {
      if (id !== null) {
        return saved.map((contact) => contact.id === id ? { ...contact, ...fields } : contact);
      }

      return [{ id: createContactId(), ...fields, favorite: false }, ...saved];
    });
  } catch {
    setStatus("保存失败，请检查浏览器存储。", "error");
    return;
  } finally {
    saveButton.disabled = false;
    cancelEditButton.disabled = false;
  }

  resetEditor();
  search.value = "";
  selectFilter(id !== null && favoritesOnly);
  setDirectoryStatus();
  setStatus("联系人已保存。", "success");
  nameInput.focus();
});

form.addEventListener("input", (event) => {
  formDirty = true;
  const input = event.target;
  if (input.matches("input.method-value[type='tel']")) {
    if (/[^0-9]/.test(input.value)) {
      input.value = input.dataset.digits ?? "";
      input.dataset.rejectedCharacters = "true";
      setStatus("电话号码只允许输入 0–9。", "error");
      input.setAttribute("aria-invalid", "true");
      return;
    }

    input.dataset.digits = input.value;
    delete input.dataset.rejectedCharacters;
  }

  if (input.hasAttribute("aria-invalid")) {
    input.removeAttribute("aria-invalid");
    setStatus("");
  }
});

addMethodButton.addEventListener("click", () => {
  formDirty = true;
  appendMethod().querySelector(".method-type").focus();
});
cancelEditButton.addEventListener("click", () => {
  if (!canLeaveEditor()) return;
  const button = findCardButton(editingId, "edit");
  resetEditor();
  (button ?? nameInput).focus();
});

methodList.addEventListener("change", (event) => {
  formDirty = true;
  if (!event.target.matches(".method-type")) return;

  const row = event.target.closest(".method-row");
  const input = row.querySelector(".method-value");
  input.value = "";
  input.dataset.digits = "";
  delete input.dataset.rejectedCharacters;
  row.querySelector(".method-region").value = "";
  row.querySelector(".legacy-phone-note").hidden = true;
  originalMethods.delete(row);
  updateMethodFields(row);
  setStatus("");
});

methodList.addEventListener("click", (event) => {
  if (!event.target.matches(".remove-method")) return;

  const row = event.target.closest(".method-row");
  const neighbor = row.nextElementSibling ?? row.previousElementSibling;
  formDirty = true;
  row.remove();
  setStatus("");
  (neighbor?.querySelector(".method-type") ?? addMethodButton).focus();
});

list.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.closest(".contact-card").dataset.contactId;
  const contact = contacts.find((entry) => entry.id === id);

  if (button.dataset.action === "select") {
    if (saveButton.disabled || (!editorPanel.hidden && !canLeaveEditor())) return;
    showContact(contact);
    (findCardButton(id, "select") ?? detailClose).focus();
    return;
  }

  if (button.dataset.action === "edit") {
    if (saveButton.disabled || (!editorPanel.hidden && !canLeaveEditor())) return;
    resetEditor(contact);
    renderContacts();
    nameInput.focus();
    return;
  }

  if (button.dataset.action === "remove") {
    removeDialog.dataset.contactId = id;
    removeMessage.textContent = `确认删除「${contact.name}」？`;
    removeError.hidden = true;
    removeDialog.showModal();
    return;
  }

  button.disabled = true;

  try {
    await updateContacts((saved) => saved.map((entry) =>
      entry.id === id ? { ...entry, favorite: !contact.favorite } : entry,
    ));
  } catch {
    button.disabled = false;
    setDirectoryStatus("保存收藏状态失败，请检查浏览器存储。");
    return;
  }

  setDirectoryStatus();
  if (selectedId === id) {
    const selected = contacts.find((entry) => entry.id === id);
    if (selected) {
      showContact(selected);
    } else {
      resetEditor();
      renderContacts();
    }
  } else {
    renderContacts();
  }
  (findCardButton(id, "favorite") ?? showFavorites).focus();
});

confirmRemove.addEventListener("click", async () => {
  const id = removeDialog.dataset.contactId;
  confirmRemove.disabled = true;

  try {
    await updateContacts((saved) => saved.filter((contact) => contact.id !== id));
  } catch {
    removeError.textContent = "删除失败，请检查浏览器存储。";
    removeError.hidden = false;
    return;
  } finally {
    confirmRemove.disabled = false;
  }

  if (editingId === id || selectedId === id) resetEditor();

  removeDialog.close();
  renderContacts();
  setDirectoryStatus("联系人已删除。", "success");
  search.focus();
});

detailEdit.addEventListener("click", () => {
  const contact = contacts.find((entry) => entry.id === selectedId);
  if (!contact) return;
  resetEditor(contact);
  renderContacts();
  nameInput.focus();
});

function openNewContact() {
  resetEditor();
  renderContacts();
  nameInput.focus();
}

detailNew.addEventListener("click", openNewContact);
detailClose.addEventListener("click", openNewContact);

importButton.addEventListener("click", () => excelFile.click());
excelFile.addEventListener("change", async () => {
  const [file] = excelFile.files;
  excelFile.value = "";
  if (!file) return;

  if (!/\.xlsx$/i.test(file.name)) {
    setDirectoryStatus("请选择 .xlsx 文件。");
    return;
  }

  importButton.disabled = true;
  setDirectoryStatus("正在读取 Excel 文件…", "success");

  try {
    const parsed = parseContactsWorkbook(await file.arrayBuffer());
    if (parsed.length === 0) {
      setDirectoryStatus("Excel 中没有联系人记录。");
      return;
    }

    const imported = parsed.map((contact) => ({ id: createContactId(), ...contact }));
    await updateContacts((saved) => [...imported, ...saved]);
    search.value = "";
    selectFilter(false);
    setDirectoryStatus(`已导入 ${imported.length} 位联系人。`, "success");
  } catch (error) {
    setDirectoryStatus(error.message || "导入失败，请检查文件格式和浏览器存储。");
  } finally {
    importButton.disabled = false;
  }
});

exportButton.addEventListener("click", () => {
  try {
    downloadContactsWorkbook(loadContacts());
    setDirectoryStatus("Excel 文件已生成。", "success");
  } catch (error) {
    setDirectoryStatus(error.message || "导出失败，请检查浏览器存储。");
  }
});

search.addEventListener("input", renderContacts);
showAll.addEventListener("click", () => selectFilter(false));
showFavorites.addEventListener("click", () => selectFilter(true));
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    refreshContacts();
  }
});

resetEditor();
refreshContacts();
