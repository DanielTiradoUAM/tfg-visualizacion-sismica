export function setDetail(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "-";
}

