// Ergänzt app.json: APP_BASE_URL überschreibt den Unterpfad (z. B. "/" für lokale Tests, Standard "/App-" für GitHub Pages).
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, baseUrl: process.env.APP_BASE_URL ?? config.experiments?.baseUrl },
});
