/* eslint-disable @typescript-eslint/no-require-imports -- preload CommonJS do Node */
// Compatibilidade restrita aos processos locais de teste no Windows.
const os = require("node:os");
const { syncBuiltinESMExports } = require("node:module");
if (process.platform === "win32") {
  try { os.userInfo(); } catch (error) {
    if (error.code !== "ERR_SYSTEM_ERROR" || error.info?.syscall !== "uv_os_get_passwd") throw error;
    const username = process.env.USERNAME;
    if (!username) throw error;
    os.userInfo = () => ({ username, uid: -1, gid: -1, homedir: os.homedir(), shell: null });
    syncBuiltinESMExports();
  }
}
