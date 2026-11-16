// Colour theme: saved choice, else the system preference. Shared by the tool and the guide pages.
const root = document.documentElement;

export function initTheme(button: HTMLElement) {
  try {
    const saved = localStorage.getItem('reveal-theme');
    if (saved) root.dataset.theme = saved;
    else if (matchMedia('(prefers-color-scheme: light)').matches) root.dataset.theme = 'light';
  } catch {
    /* storage may be blocked */
  }
  button.addEventListener('click', () => {
    const t = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = t;
    try {
      localStorage.setItem('reveal-theme', t);
    } catch {
      /* storage may be blocked */
    }
  });
}
