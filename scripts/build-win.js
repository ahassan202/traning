/*
 * Builds the Windows x64 app and installer without Wine:
 *   1) electron-builder packages the app (dir target)
 *   2) resedit sets the exe icon + version info (pure JS)
 *   3) makensis compiles installer/installer.nsi -> dist/IT-Infra-Tracker-Setup-<ver>.exe
 *   4) a portable zip of the unpacked app is created
 * Works on Linux (apt install nsis zip) and on Windows (NSIS in PATH).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;
const dist = path.join(root, 'dist');
const unpacked = path.join(dist, 'win-unpacked');
const exe = path.join(unpacked, 'IT Infra Tracker.exe');
const icoPath = path.join(root, 'build', 'icon.ico');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });

(async () => {
  fs.rmSync(dist, { recursive: true, force: true });
  const ebBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
  run(ebBin, ['--win', 'dir', '--x64', '-c.win.signAndEditExecutable=false'], { shell: process.platform === 'win32' });

  // Icon (.ico with 16..256 px)
  const pngToIco = require('png-to-ico');
  fs.writeFileSync(icoPath, await pngToIco(path.join(root, 'build', 'icon.png')));

  // Stamp exe icon and version info
  const ResEdit = await import('resedit');
  const PE = await import('pe-library');
  const data = fs.readFileSync(exe);
  const pe = PE.NtExecutable.from(data, { ignoreCert: true });
  const res = PE.NtExecutableResource.from(pe);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, iconFile.icons.map(i => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
  const [ma, mi, pa] = version.split('.').map(Number);
  vi.setFileVersion(ma, mi, pa, 0, 1033);
  vi.setProductVersion(ma, mi, pa, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    ProductName: pkg.productName, FileDescription: pkg.productName, CompanyName: 'IT Infrastructure',
    OriginalFilename: 'IT Infra Tracker.exe', InternalName: 'IT Infra Tracker', LegalCopyright: 'MIT License',
    FileVersion: version, ProductVersion: version
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log('• exe icon and version info updated');

  // Installer
  const outFile = path.join(dist, `IT-Infra-Tracker-Setup-${version}.exe`);
  run('makensis', ['-V2', `-DVERSION=${version}`, `-DOUTFILE=${outFile}`, `-DSRCDIR=${unpacked}`, `-DICON=${icoPath}`, path.join(root, 'installer', 'installer.nsi')]);
  console.log('• installer:', outFile);

  // Portable zip (Linux/macOS: zip CLI, Windows: PowerShell)
  const zipOut = path.join(dist, `IT-Infra-Tracker-Portable-${version}.zip`);
  if (process.platform === 'win32') {
    run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${unpacked}\\*' -DestinationPath '${zipOut}' -Force`]);
  } else {
    run('zip', ['-qr', zipOut, '.'], { cwd: unpacked });
  }
  console.log('• portable zip:', zipOut);
})().catch(e => { console.error(e); process.exit(1); });
