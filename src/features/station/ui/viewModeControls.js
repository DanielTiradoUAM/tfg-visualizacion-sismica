export function setStatusLabel(statusEl, statusText, state, label) {
  if (!statusEl || !statusText) return;

  statusEl.classList.remove(
    "topnav__status--live",
    "topnav__status--error",
    "topnav__status--loading"
  );

  switch (state) {
    case "live":
      statusEl.classList.add("topnav__status--live");
      statusText.textContent = "LIVE";
      break;
    case "error":
      statusEl.classList.add("topnav__status--error");
      statusText.textContent = "ERROR";
      break;
    case "loading":
      statusEl.classList.add("topnav__status--loading");
      statusText.textContent = label ?? "CARGANDO";
      break;
    default:
      statusText.textContent = label ?? "CONNECTING";
  }
}

