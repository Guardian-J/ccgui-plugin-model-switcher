const { execFileSync } = require('node:child_process');

function browserCommand(value, platform = process.platform) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error('Only HTTP/HTTPS URLs without credentials are supported');
  }
  // The URL is passed as data, never interpolated into a shell command.
  if (platform === 'win32') return {
    bin: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference = "Stop"; Start-Process -FilePath $env:CCGUI_BROWSER_URL'],
    env: { CCGUI_BROWSER_URL: url.href },
  };
  if (platform === 'darwin') return { bin: 'open', args: [url.href] };
  if (platform === 'linux') return { bin: 'xdg-open', args: [url.href] };
  throw new Error('Unsupported desktop platform');
}

if (require.main === module || module.id === '[eval]') {
  try {
    const command = browserCommand(process.argv[module.id === '[eval]' ? 1 : 2]);
    execFileSync(command.bin, command.args, {
      env: { ...process.env, ...command.env }, windowsHide: true, timeout: 10000, stdio: 'ignore',
    });
  } catch {
    process.stderr.write('Unable to open the system browser');
    process.exitCode = 1;
  }
}

module.exports = { browserCommand };
