export const PHONE_REGIONS = new Map([
  ["CN", { name: "中国大陆", code: "+86" }],
  ["HK", { name: "中国香港", code: "+852" }],
  ["MO", { name: "中国澳门", code: "+853" }],
  ["TW", { name: "中国台湾", code: "+886" }],
  ["IE", { name: "爱尔兰", code: "+353" }],
  ["GB", { name: "英国", code: "+44" }],
  ["US", { name: "美国", code: "+1" }],
  ["CA", { name: "加拿大", code: "+1" }],
  ["JP", { name: "日本", code: "+81" }],
  ["SG", { name: "新加坡", code: "+65" }],
]);

export function validatePhone(value) {
  if (/[^0-9]/.test(value)) {
    return { value, error: "电话号码只允许输入 0–9。" };
  }

  if (!/^[0-9]{3,15}$/.test(value)) {
    return { value, error: "电话号码应包含 3 到 15 位数字。" };
  }

  return { value, error: "" };
}

export function phoneEditorValue(value) {
  const ungrouped = value.replace(/\((\d+)\)/g, "$1");
  if (/[^+0-9 -]/.test(ungrouped) || !/^\+?[0-9]+(?:[ -]+[0-9]+)*$/.test(ungrouped)) {
    return "";
  }

  return ungrouped.replace(/[^0-9]/g, "");
}
