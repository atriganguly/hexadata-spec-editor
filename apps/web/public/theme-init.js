// Applies the saved theme before first paint (no flash). External file because the CSP forbids inline scripts.
try {
  var theme = localStorage.getItem('hd-theme');
  if (theme === 'light' || theme === 'dark')
    document.documentElement.setAttribute('data-theme', theme);
} catch {
  /* storage unavailable: follow the system theme */
}
