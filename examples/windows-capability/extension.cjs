// Developer-only, no Agent tools or product activation changes.
exports.activate = async () => {
  if (process.env.VIBE_W1_ACTIVATION_PROBE === '1') await require('./test.cjs').run()
}
