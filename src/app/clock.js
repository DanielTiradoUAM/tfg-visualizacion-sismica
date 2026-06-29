export function initUtcClock(clockEl = document.getElementById("utc-clock")) {
  if (!clockEl) return null;

  const tick = () => {
    const now = new Date();
    const pad = value => String(value).padStart(2, "0");
    clockEl.textContent = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
  };

  tick();
  return setInterval(tick, 1000);
}

