import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const appIdentity = require('./build/app_identity.json')

/** @type {import('app-builder-lib').Configuration} */
const config = {
  appId: appIdentity.appId,
  asar: true,
  productName: appIdentity.productName,
  directories: {
    output: 'release/${version}',
  },
  files: ['dist', 'dist-electron'],
  mac: {
    target: ['dmg'],
    artifactName: '${productName}-Mac-${version}-Installer.${ext}',
  },
  win: {
    icon: 'public/app-icon.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    artifactName: '${productName}-Windows-${version}-Setup.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
  },
  linux: {
    icon: 'public/app-icon.png',
    target: ['AppImage'],
    artifactName: '${productName}-Linux-${version}.${ext}',
  },
}

export default config
