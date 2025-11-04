const { ipcRenderer } = require('electron');

// Since contextIsolation is false, we can directly expose to window
if (typeof window !== 'undefined') {
  window.require = require;
  
  // Expose electronAPI directly to window
  window.electronAPI = {
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    getSupportedLanguages: () => ipcRenderer.invoke('get-supported-languages'),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
    listSnippets: (language) => ipcRenderer.invoke('list-snippets', language),
    saveSnippet: (name, content, language) => ipcRenderer.invoke('save-snippet', name, content, language),
    deleteSnippet: (name, language) => ipcRenderer.invoke('delete-snippet', name, language),
    installPackage: (packageName, language) => ipcRenderer.invoke('install-package', packageName, language),
    uninstallPackage: (packageName, language) => ipcRenderer.invoke('uninstall-package', packageName, language),
    loadSettings: () => ipcRenderer.invoke('load-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    executeCode: (code, userDataPath, magicComments, language) => ipcRenderer.invoke('execute-code', code, userDataPath, magicComments, language),
    stopExecution: () => ipcRenderer.invoke('stop-execution'),
    listInstalledPackages: (language) => ipcRenderer.invoke('list-installed-packages', language),
    showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
    getResourcesPath: () => ipcRenderer.invoke('get-resources-path'),
    getAppPath: () => ipcRenderer.invoke('get-app-path')
  };
}

