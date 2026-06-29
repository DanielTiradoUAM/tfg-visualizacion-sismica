export function getSelectableChannels(station) {
  const channels = [...new Set(
    (station?.channels ?? [])
      .map(ch => ch.channelCode?.trim().toUpperCase())
      .filter(Boolean)
  )];

  channels.sort((left, right) => {
    const order = ["HH", "BH", "EH"];
    const leftWeight = order.indexOf(left.slice(0, 2));
    const rightWeight = order.indexOf(right.slice(0, 2));
    const normalizedLeft = leftWeight === -1 ? 99 : leftWeight;
    const normalizedRight = rightWeight === -1 ? 99 : rightWeight;
    if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;

    const orientationOrder = ["Z", "N", "E"];
    return orientationOrder.indexOf(left[2]) - orientationOrder.indexOf(right[2]);
  });

  return channels;
}

export function renderChannelOptions(selectEl, channels, activeChannel) {
  if (!selectEl) return;

  selectEl.innerHTML = "";

  for (const channelCode of channels) {
    const option = document.createElement("option");
    option.value = channelCode;
    option.textContent = channelCode;
    option.selected = channelCode === activeChannel;
    selectEl.appendChild(option);
  }
}

