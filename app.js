const STORAGE_KEY = "assessment-2.contacts";
const METHOD_LABELS = new Map([
  ["phone", "电话"],
  ["email", "邮箱"],
]);

const form = document.querySelector("#contact-form");
const nameInput = form.elements.namedItem("name");
const list = document.querySelector("#contacts-list");
const emptyState = document.querySelector("#empty-state");
const searchEmpty = document.querySelector("#search-empty");
const count = document.querySelector("#contact-count");
const formStatus = document.querySelector("#form-status");
const search = document.querySelector("#search-input");

let contacts = [];

function isValidContact(contact) {
  return (
    typeof contact?.id === "string" &&
    typeof contact.name === "string" &&
    Array.isArray(contact.methods) &&
    contact.methods.every(
      (method) => typeof method?.type === "string" && typeof method.value === "string",
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

function setStatus(message, state) {
  formStatus.textContent = message;
  formStatus.dataset.state = state;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function createCard(contact) {
  const card = createElement("article", "contact-card");
  const initials = Array.from(contact.name).slice(0, 2).join("").toUpperCase();
  const avatar = createElement("div", "contact-avatar", initials);
  const body = createElement("div", "contact-body");
  const name = createElement("h3", "contact-name", contact.name);

  avatar.setAttribute("aria-hidden", "true");
  body.append(name);

  if (contact.methods.length > 0) {
    const details = createElement("dl", "contact-details");

    for (const method of contact.methods) {
      const detail = createElement("div", "contact-detail");
      detail.append(
        createElement("dt", "contact-detail-label", METHOD_LABELS.get(method.type) ?? method.type),
        createElement("dd", "contact-detail-value", method.value),
      );
      details.append(detail);
    }

    body.append(details);
  }

  card.append(avatar, body);
  return card;
}

function renderContacts() {
  const query = search.value.trim().toLowerCase();
  const matches = contacts.filter((contact) => {
    const fields = [contact.name, ...contact.methods.map((method) => method.value)];
    return fields.some((field) => field.toLowerCase().includes(query));
  });

  list.replaceChildren(...matches.map(createCard));
  count.textContent = String(contacts.length);
  emptyState.hidden = contacts.length > 0;
  searchEmpty.hidden = contacts.length === 0 || matches.length > 0;
  list.hidden = matches.length === 0;
}

function refreshContacts() {
  try {
    contacts = loadContacts();
  } catch {
    setStatus("无法读取已保存的联系人，请检查浏览器存储。", "error");
  }

  renderContacts();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const fields = new FormData(form);
  const name = fields.get("name").trim();

  if (!name) {
    setStatus("请输入联系人姓名。", "error");
    nameInput.focus();
    return;
  }

  const methods = Array.from(METHOD_LABELS.keys(), (type) => ({
    type,
    value: fields.get(type).trim(),
  })).filter((method) => method.value);
  const id = globalThis.crypto.randomUUID?.()
    ?? globalThis.crypto.getRandomValues(new Uint32Array(4)).join("-");
  const contact = { id, name, methods };

  try {
    const updatedContacts = [contact, ...loadContacts()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedContacts));
    contacts = updatedContacts;
  } catch {
    setStatus("保存失败，请检查浏览器存储。", "error");
    return;
  }

  form.reset();
  search.value = "";
  renderContacts();
  setStatus("联系人已保存。", "success");
  nameInput.focus();
});

search.addEventListener("input", renderContacts);
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    refreshContacts();
  }
});

refreshContacts();
