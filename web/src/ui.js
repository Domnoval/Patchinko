export function makeHUD() {
  const $state = document.getElementById('state-badge');
  const $queue = document.getElementById('queue-count');
  const $tray  = document.getElementById('tray-count');
  const $banner = document.getElementById('reach-banner');
  const $tier   = document.getElementById('reach-tier');

  $banner.classList.remove('hidden');

  return {
    setState(state) {
      $state.textContent = state;
      $state.dataset.state = state;
    },
    setQueue(n) { $queue.textContent = n; },
    setTray(n)  { $tray.textContent = n; },
    showReach(tier) {
      $tier.textContent = tier === 'LEGENDARY' ? 'LEGENDARY REACH'
                        : tier === 'PREMIUM'   ? 'PREMIUM REACH'
                        : tier === 'SUPER'     ? 'SUPER REACH'
                        :                        'REACH';
      $banner.dataset.tier = tier;
      $banner.classList.add('shown');
    },
    hideReach() {
      $banner.classList.remove('shown');
    },
  };
}
