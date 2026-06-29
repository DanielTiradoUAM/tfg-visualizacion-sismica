import * as sp from "../../../vendor/seisplot/seisplotjs.mjs";

export function renderSelectedStationsPanel({
  map,
  stations,
  activeStation,
  onFocusStation,
  onRemoveStation,
}) {
  const panel = document.getElementById("stationInfoPanel");

  if (panel) {
    panel.classList.toggle("hidden", stations.length === 0);
  }

  const list = document.getElementById("selectedStationsList");
  if (!list) return;

  list.innerHTML = "";

  for (const station of stations) {
    const stationCode = station.codes();

    const item = document.createElement("div");
    item.className = "station-list-item";
    if (activeStation?.codes() === stationCode) {
      item.classList.add("station-list-item--active");
    }

    const stationBtn = document.createElement("button");
    stationBtn.className = "station-btn";
    stationBtn.textContent = stationCode;

    const removeBtn = document.createElement("button");
    removeBtn.className = "station-remove-btn";
    removeBtn.textContent = "-";

    stationBtn.addEventListener("click", () => onFocusStation(station));
    removeBtn.addEventListener("click", event => {
      event.stopPropagation();
      onRemoveStation(station);

      map.colorClass(
        sp.leafletutil.cssClassForStationCodes(station),
        null
      );
    });

    item.appendChild(stationBtn);
    item.appendChild(removeBtn);
    list.appendChild(item);
  }
}
