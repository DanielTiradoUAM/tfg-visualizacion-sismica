let rayLines = new Map();
let waveAnimation = null;
let dashOffset = 0;

function getGreatCirclePoints(lat1, lon1, lat2, lon2, pointsCount = 50) {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;

  const rLat1 = lat1 * toRad;
  const rLon1 = lon1 * toRad;
  const rLat2 = lat2 * toRad;
  const rLon2 = lon2 * toRad;

  const d = 2 * Math.asin(Math.sqrt(
    Math.pow(Math.sin((rLat1 - rLat2) / 2), 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.pow(Math.sin((rLon1 - rLon2) / 2), 2)
  ));

  const points = [];

  for (let i = 0; i <= pointsCount; i++) {
    const f = i / pointsCount;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x = A * Math.cos(rLat1) * Math.cos(rLon1) + B * Math.cos(rLat2) * Math.cos(rLon2);
    const y = A * Math.cos(rLat1) * Math.sin(rLon1) + B * Math.cos(rLat2) * Math.sin(rLon2);
    const z = A * Math.sin(rLat1) + B * Math.sin(rLat2);

    points.push([
      Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg,
      Math.atan2(y, x) * toDeg,
    ]);
  }

  return points;
}

export function clearAllRayLines() {
  rayLines.forEach(line => line.remove());
  rayLines.clear();

  if (waveAnimation) {
    clearInterval(waveAnimation);
    waveAnimation = null;
  }
}

export function renderSeismicRays(map, quake, stations) {
  clearAllRayLines();

  if (!quake || !map?.map) return;

  for (const station of stations) {
    const points = getGreatCirclePoints(
      quake.latitude,
      quake.longitude,
      station.latitude,
      station.longitude
    );

    const line = window.L.polyline(points, {
      weight: 3,
      color: "#ff4d4d",
      opacity: 0.7,
      dashArray: "8 8",
      lineJoin: "round",
    }).addTo(map.map);

    rayLines.set(station.codes(), line);
  }

  startWaveAnimation();
}

export function startWaveAnimation() {
  if (waveAnimation || rayLines.size === 0) return;

  dashOffset = 0;

  waveAnimation = setInterval(() => {
    dashOffset -= 1;

    rayLines.forEach(line => {
      line.setStyle({ dashOffset });
    });
  }, 40);
}

