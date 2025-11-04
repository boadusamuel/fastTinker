const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn } = require('child_process');

let mainWindow;

const userDataPath = app.getPath('userData');

// Supported languages configuration
const LANGUAGES = {
  'javascript': {
    extensions: ['.js', '.ts'],
    defaultExtension: '.js',
    monacoLanguage: 'javascript',
    packageManager: 'npm',
    resultMarker: '__FASTTINKER_JS_RESULT_START__',
    resultMarkerEnd: '__FASTTINKER_JS_RESULT_END__'
  },
  'php': {
    extensions: ['.php'],
    defaultExtension: '.php',
    monacoLanguage: 'php',
    packageManager: 'composer',
    resultMarker: '__FASTTINKER_PHP_RESULT_START__',
    resultMarkerEnd: '__FASTTINKER_PHP_RESULT_END__'
  }
};

// Ensure directories exist
async function ensureDirectories() {
  const snippetsDir = path.join(userDataPath, 'snippets');
  const packagesDir = path.join(userDataPath, 'node_modules');
  const vendorDir = path.join(userDataPath, 'vendor');
  try {
    await fs.mkdir(snippetsDir, { recursive: true });
    await fs.mkdir(packagesDir, { recursive: true });
    await fs.mkdir(vendorDir, { recursive: true });
  } catch (err) {
    console.error('Error creating directories:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '../index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[${level}] ${message}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await ensureDirectories();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('get-user-data-path', () => userDataPath);

ipcMain.handle('get-resources-path', () => {
  return process.resourcesPath || app.getAppPath();
});

ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

ipcMain.handle('get-supported-languages', () => {
  return Object.keys(LANGUAGES).map(key => ({
    id: key,
    name: key === 'javascript' ? 'JavaScript/TypeScript' : 'PHP',
    ...LANGUAGES[key]
  }));
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('list-snippets', async (event, language = 'javascript') => {
  try {
    const snippetsDir = path.join(userDataPath, 'snippets');
    const files = await fs.readdir(snippetsDir);
    const langConfig = LANGUAGES[language];
    if (!langConfig) {
      return [];
    }
    return files.filter(f => langConfig.extensions.some(ext => f.endsWith(ext)));
  } catch (err) {
    return [];
  }
});

ipcMain.handle('save-snippet', async (event, name, content, language = 'javascript') => {
  try {
    const snippetsDir = path.join(userDataPath, 'snippets');
    const langConfig = LANGUAGES[language];
    if (!langConfig) {
      return { success: false, error: 'Unsupported language' };
    }
    const filePath = path.join(snippetsDir, `${name}${langConfig.defaultExtension}`);
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-snippet', async (event, name, language = 'javascript') => {
  try {
    const snippetsDir = path.join(userDataPath, 'snippets');
    const langConfig = LANGUAGES[language];
    if (!langConfig) {
      return { success: false, error: 'Unsupported language' };
    }
    const filePath = path.join(snippetsDir, `${name}${langConfig.defaultExtension}`);
    await fs.unlink(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-package', async (event, packageName, language = 'javascript') => {
  const langConfig = LANGUAGES[language];
  if (!langConfig) {
    return { success: false, error: 'Unsupported language' };
  }

  if (langConfig.packageManager === 'npm') {
    return new Promise((resolve) => {
      const packageJsonPath = path.join(userDataPath, 'package.json');
      fs.readFile(packageJsonPath, 'utf-8').catch(async () => {
        await fs.writeFile(packageJsonPath, JSON.stringify({
          name: 'fasttinker-packages',
          version: '1.0.0',
          description: 'fastTinker installed packages',
          dependencies: {}
        }, null, 2), 'utf-8');
      }).then(() => {
        const npmProcess = spawn('npm', ['install', packageName, '--prefix', userDataPath, '--save', '--no-audit', '--no-fund'], {
          cwd: userDataPath,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        npmProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        npmProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        npmProcess.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, output: stdout });
          } else {
            resolve({ success: false, error: stderr || stdout });
          }
        });

        npmProcess.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
      });
    });
  } else if (langConfig.packageManager === 'composer') {
    return new Promise((resolve) => {
      const composerJsonPath = path.join(userDataPath, 'composer.json');
      fs.readFile(composerJsonPath, 'utf-8').catch(async () => {
        await fs.writeFile(composerJsonPath, JSON.stringify({
          name: 'fasttinker/packages',
          description: 'fastTinker installed packages',
          require: {}
        }, null, 2), 'utf-8');
      }).then(async () => {
        const composerPath = await findComposerExecutable();
        
        const composerProcess = spawn(composerPath, ['require', packageName, '--working-dir', userDataPath, '--no-interaction'], {
          cwd: userDataPath,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        composerProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        composerProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        composerProcess.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, output: stdout });
          } else {
            resolve({ success: false, error: stderr || stdout });
          }
        });

        composerProcess.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
      });
    });
  }
});

ipcMain.handle('list-installed-packages', async (event, language = 'javascript') => {
  const langConfig = LANGUAGES[language];
  if (!langConfig) {
    return [];
  }

  try {
    if (langConfig.packageManager === 'npm') {
      const packageJsonPath = path.join(userDataPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      return Object.keys(pkg.dependencies || {});
    } else if (langConfig.packageManager === 'composer') {
      const composerJsonPath = path.join(userDataPath, 'composer.json');
      const content = await fs.readFile(composerJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      return Object.keys(pkg.require || {});
    }
  } catch (err) {
    return [];
  }
  return [];
});

ipcMain.handle('uninstall-package', async (event, packageName, language = 'javascript') => {
  const langConfig = LANGUAGES[language];
  if (!langConfig || langConfig.packageManager !== 'composer') {
    return { success: false, error: 'Uninstall only supported for Composer packages' };
  }

  return new Promise((resolve) => {
    const composerJsonPath = path.join(userDataPath, 'composer.json');
    fs.readFile(composerJsonPath, 'utf-8').then(async () => {
      const composerPath = await findComposerExecutable();
      
      const composerProcess = spawn(composerPath, ['remove', packageName, '--working-dir', userDataPath, '--no-interaction'], {
        cwd: userDataPath,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      composerProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      composerProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      composerProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: stdout });
        } else {
          resolve({ success: false, error: stderr || stdout });
        }
      });

      composerProcess.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    }).catch((err) => {
      resolve({ success: false, error: err.message });
    });
  });
});

ipcMain.handle('show-message-box', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result;
});

ipcMain.handle('load-settings', async () => {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    const content = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return {
      general: {
        autoRun: true,
        lineWrap: false,
        vimKeys: false,
        closeBrackets: true,
        matchLines: true,
        scrolling: true,
        confirmClose: true,
        autocomplete: true,
        linting: true,
        hoverInfo: true,
        signatures: true
      },
      build: {
        typescript: true,
        jsx: true,
        optionalChaining: true,
        regexpModifiers: true,
        doExpressions: true,
        pipeline: true,
        recordTuples: true,
        throwExpressions: true,
        asyncGenerators: true
      },
      advanced: {
        expressionResults: true,
        showUndefined: false,
        loopProtection: true
      }
    };
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

let executionProcesses = new Map();

// Function to find Node.js executable
async function findNodeExecutable() {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  return new Promise((resolve) => {
    let resolved = false;
    
    const tryResolve = (nodePath) => {
      if (!resolved) {
        resolved = true;
        resolve(nodePath);
      }
    };
    
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir) {
      try {
        const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node');
        if (fsSync.existsSync(nvmDir)) {
          const versions = fsSync.readdirSync(nvmDir);
          const sortedVersions = versions.sort((a, b) => {
            return b.localeCompare(a, undefined, { numeric: true });
          });
          
          for (const version of sortedVersions) {
            const nodePath = path.join(nvmDir, version, 'bin', 'node');
            if (fsSync.existsSync(nodePath)) {
              console.log('Found Node.js in nvm:', nodePath);
              tryResolve(nodePath);
              return;
            }
          }
        }
      } catch (e) {
        console.log('Error checking nvm paths:', e.message);
      }
    }
    
    const command = process.platform === 'win32' ? 'where node' : 'which node';
    execAsync(command)
      .then(({ stdout }) => {
        const nodePath = stdout.trim().split('\n')[0];
        if (nodePath && fsSync.existsSync(nodePath)) {
          console.log('Found Node.js via which/where:', nodePath);
          tryResolve(nodePath);
          return;
        }
        checkCommonPaths();
      })
      .catch(() => {
        checkCommonPaths();
      });
    
    function checkCommonPaths() {
      const commonPaths = process.platform === 'win32'
        ? [
            path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'nodejs', 'node.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
            path.join(process.env.APPDATA || '', 'npm', 'node.exe')
          ]
        : [
            '/usr/bin/node',
            '/usr/local/bin/node',
            '/opt/homebrew/bin/node',
            '/snap/bin/node',
          ];
      
      for (const nodePath of commonPaths) {
        if (fsSync.existsSync(nodePath)) {
          console.log('Found Node.js at common path:', nodePath);
          tryResolve(nodePath);
          return;
        }
      }
      
      if (!resolved) {
        console.warn('Node.js not found in any checked location, trying "node" command');
        tryResolve('node');
      }
    }
  });
}

// Function to find PHP executable
async function findPHPExecutable() {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  return new Promise((resolve) => {
    let resolved = false;
    
    const tryResolve = (phpPath) => {
      if (!resolved) {
        resolved = true;
        resolve(phpPath);
      }
    };
    
    const command = process.platform === 'win32' ? 'where php' : 'which php';
    execAsync(command)
      .then(({ stdout }) => {
        const phpPath = stdout.trim().split('\n')[0];
        if (phpPath && fsSync.existsSync(phpPath)) {
          console.log('Found PHP via which/where:', phpPath);
          tryResolve(phpPath);
          return;
        }
        checkCommonPaths();
      })
      .catch(() => {
        checkCommonPaths();
      });
    
    function checkCommonPaths() {
      const commonPaths = process.platform === 'win32'
        ? [
            path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'PHP', 'php.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'PHP', 'php.exe'),
            'C:\\xampp\\php\\php.exe',
            'C:\\wamp\\bin\\php\\php.exe'
          ]
        : [
            '/usr/bin/php',
            '/usr/local/bin/php',
            '/opt/homebrew/bin/php',
            '/snap/bin/php',
            '/usr/local/php/bin/php'
          ];
      
      for (const phpPath of commonPaths) {
        if (fsSync.existsSync(phpPath)) {
          console.log('Found PHP at common path:', phpPath);
          tryResolve(phpPath);
          return;
        }
      }
      
      if (!resolved) {
        console.warn('PHP not found in any checked location, trying "php" command');
        tryResolve('php');
      }
    }
  });
}

// Function to find Composer executable
async function findComposerExecutable() {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  return new Promise((resolve) => {
    let resolved = false;
    
    const tryResolve = (composerPath) => {
      if (!resolved) {
        resolved = true;
        resolve(composerPath);
      }
    };
    
    const command = process.platform === 'win32' ? 'where composer' : 'which composer';
    execAsync(command)
      .then(({ stdout }) => {
        const composerPath = stdout.trim().split('\n')[0];
        if (composerPath && fsSync.existsSync(composerPath)) {
          console.log('Found Composer via which/where:', composerPath);
          tryResolve(composerPath);
          return;
        }
        checkCommonPaths();
      })
      .catch(() => {
        checkCommonPaths();
      });
    
    function checkCommonPaths() {
      const commonPaths = process.platform === 'win32'
        ? [
            path.join(process.env.APPDATA || '', 'Composer', 'composer.bat'),
            path.join(process.env.LOCALAPPDATA || '', 'Composer', 'composer.bat')
          ]
        : [
            '/usr/local/bin/composer',
            '/usr/bin/composer',
            path.join(process.env.HOME || '', '.composer', 'vendor', 'bin', 'composer'),
            path.join(process.env.HOME || '', '.config', 'composer', 'vendor', 'bin', 'composer')
          ];
      
      for (const composerPath of commonPaths) {
        if (fsSync.existsSync(composerPath)) {
          console.log('Found Composer at common path:', composerPath);
          tryResolve(composerPath);
          return;
        }
      }
      
      if (!resolved) {
        console.warn('Composer not found in any checked location, trying "composer" command');
        tryResolve('composer');
      }
    }
  });
}

// Execute JavaScript/TypeScript code
async function executeJavaScript(code, userDataPath, magicComments = []) {
  return new Promise((resolve) => {
    const execId = Date.now().toString();
    const userNodeModulesPath = path.join(userDataPath, 'node_modules').replace(/\\/g, '/');
    
    const scriptHeader = `// Hybrid environment setup
global.window = global;
global.document = {
  createElement: () => ({
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    style: {},
    innerHTML: '',
    innerText: '',
    textContent: ''
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { appendChild: () => {} }
};

// Enhanced console
const __output = [];
const originalConsole = console;
function safeStringify(value) {
  try {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'function') return value.toString();
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  } catch (e) {
    return String(value);
  }
}

global.console = {
  log: (...args) => {
    const filteredArgs = args.filter(a => a !== undefined);
    if (filteredArgs.length === 0) return;
    const formatted = filteredArgs.map(a => safeStringify(a)).join(' ');
    __output.push({ type: 'log', args: formatted });
    originalConsole.log(...filteredArgs.length > 0 ? filteredArgs : args);
  },
  error: (...args) => {
    const filteredArgs = args.filter(a => a !== undefined);
    if (filteredArgs.length === 0) return;
    const formatted = filteredArgs.map(a => safeStringify(a)).join(' ');
    __output.push({ type: 'error', args: formatted });
    originalConsole.error(...filteredArgs);
  },
  warn: (...args) => {
    const filteredArgs = args.filter(a => a !== undefined);
    if (filteredArgs.length === 0) return;
    const formatted = filteredArgs.map(a => safeStringify(a)).join(' ');
    __output.push({ type: 'warn', args: formatted });
    originalConsole.warn(...filteredArgs);
  },
  info: (...args) => {
    const filteredArgs = args.filter(a => a !== undefined);
    if (filteredArgs.length === 0) return;
    const formatted = filteredArgs.map(a => safeStringify(a)).join(' ');
    __output.push({ type: 'info', args: formatted });
    originalConsole.info(...filteredArgs);
  }
};

// Setup module resolution for user packages
const Module = require('module');
const originalRequire = Module.prototype.require;
const userNodeModules = '${userNodeModulesPath}';
const nodePath = require('path');

Module.prototype.require = function(id) {
  try {
    return originalRequire.apply(this, arguments);
  } catch (e) {
    try {
      return originalRequire(nodePath.join(userNodeModules, id));
    } catch (e2) {
      throw e;
    }
  }
};

const __result = { output: [], error: null, value: undefined, magicComments: [] };

try {
  var __magicResults = [];
  
  const resultValue = (function() {
    // User code runs here
`;

    const magicCommentsEval = magicComments && magicComments.length > 0 ? magicComments.map(mc => {
      const escapedExprForDisplay = mc.expression
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"');
      
      return `
    // Magic comment evaluation for line ${mc.line}: ${mc.expression}
    try {
      var __magicEval = ${mc.expression};
      var __magicSerialized;
      try {
        JSON.stringify(__magicEval);
        __magicSerialized = __magicEval;
      } catch (serErr) {
        __magicSerialized = '[Non-serializable: ' + (typeof __magicEval) + ']';
      }
      if (typeof __magicResults !== 'undefined') {
        __magicResults.push({ line: ${mc.line}, expression: '${escapedExprForDisplay}', value: __magicSerialized });
      }
    } catch (e) {
      if (typeof __magicResults !== 'undefined') {
        __magicResults.push({ line: ${mc.line}, expression: '${escapedExprForDisplay}', value: null, error: e.message });
      }
    }`;
    }).join('\n') : '';

    const scriptFooter = `
${magicCommentsEval}
    return undefined;
  })();
  
  __result.magicComments = __magicResults;
  
  const codeResult = resultValue;
  try {
    if (codeResult !== undefined) {
      JSON.stringify(codeResult);
      __result.value = codeResult;
    }
  } catch (e) {
    __result.value = '[Non-serializable value: ' + (typeof codeResult) + ']';
  }
  __result.output = __output;
} catch (error) {
  __result.error = {
    message: error.message,
    stack: error.stack,
    name: error.name
  };
  __result.output = __output;
}

function safeJsonStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    if (typeof value === 'function') {
      return '[Function]';
    }
    if (typeof value === 'undefined') {
      return null;
    }
    return value;
  });
}

try {
  process.stdout.write('__FASTTINKER_JS_RESULT_START__\\n');
  process.stdout.write(safeJsonStringify(__result));
  process.stdout.write('\\n__FASTTINKER_JS_RESULT_END__\\n');
} catch (e) {
  process.stdout.write('__FASTTINKER_JS_RESULT_START__\\n');
  process.stdout.write(JSON.stringify({ output: __output, error: __result.error, value: '[Serialization error]' }));
  process.stdout.write('\\n__FASTTINKER_JS_RESULT_END__\\n');
}
`;

    const execScript = scriptHeader + code + scriptFooter;
    const scriptPath = path.join(require('os').tmpdir(), `fasttinker-js-${execId}.js`);
    
    fs.writeFile(scriptPath, execScript, 'utf-8').then(async () => {
      const nodeExecutable = await findNodeExecutable();
      
      const env = { 
        ...process.env,
        NODE_PATH: path.join(userDataPath, 'node_modules')
      };
      
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      if (homeDir) {
        const nvmBinPath = path.join(homeDir, '.nvm', 'versions', 'node');
        if (fsSync.existsSync(nvmBinPath)) {
          try {
            const versions = fsSync.readdirSync(nvmBinPath);
            if (versions.length > 0) {
              const sortedVersions = versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
              const latestVersionPath = path.join(nvmBinPath, sortedVersions[0], 'bin');
              if (fsSync.existsSync(latestVersionPath)) {
                env.PATH = `${latestVersionPath}:${env.PATH || ''}`;
              }
            }
          } catch (e) {
            console.log('Could not add nvm paths:', e.message);
          }
        }
      }
      
      const nodeProcess = spawn(nodeExecutable, [scriptPath], {
        env: env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      executionProcesses.set(execId, nodeProcess);
      
      let stdout = '';
      let stderr = '';
      
      nodeProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      nodeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      nodeProcess.on('close', (code) => {
        executionProcesses.delete(execId);
        fs.unlink(scriptPath).catch(() => {});
        
        try {
          const resultStart = stdout.indexOf('__FASTTINKER_JS_RESULT_START__\n');
          const resultEnd = stdout.indexOf('\n__FASTTINKER_JS_RESULT_END__', resultStart);
          
          if (resultStart !== -1 && resultEnd !== -1) {
            const jsonStr = stdout.substring(resultStart + '__FASTTINKER_JS_RESULT_START__\n'.length, resultEnd);
            const result = JSON.parse(jsonStr);
            resolve(result);
          } else if (stderr && !stdout.includes('__FASTTINKER_JS_RESULT_START__')) {
            resolve({ output: [], error: { message: stderr }, value: undefined });
          } else {
            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[0]);
              resolve(result);
            } else {
              resolve({ output: [], error: null, value: undefined });
            }
          }
        } catch (e) {
          console.error('Error parsing execution result:', e);
          resolve({ output: [], error: { message: e.message || 'Execution failed: ' + (stderr || stdout.substring(0, 200)) }, value: undefined });
        }
      });
      
      nodeProcess.on('error', (error) => {
        executionProcesses.delete(execId);
        fs.unlink(scriptPath).catch(() => {});
        
        let errorMessage = error.message;
        if (error.code === 'ENOENT') {
          errorMessage = `Node.js not found. Please install Node.js and ensure it is accessible.\n\nTried: ${nodeExecutable}`;
        }
        
        resolve({ output: [], error: { message: errorMessage, code: error.code }, value: undefined });
      });
    }).catch(err => {
      resolve({ output: [], error: { message: err.message }, value: undefined });
    });
  });
}

// Execute PHP code
async function executePHP(code, userDataPath, magicComments = []) {
  return new Promise((resolve) => {
    const execId = Date.now().toString();
    const vendorPath = path.join(userDataPath, 'vendor').replace(/\\/g, '/');
    
    let userCode = code.trim();
    if (userCode.startsWith('<?php')) {
      userCode = userCode.substring(5).trim();
    } else if (userCode.startsWith('<?=')) {
      userCode = userCode.substring(2).trim();
    } else if (userCode.startsWith('<?')) {
      userCode = userCode.substring(2).trim();
    }
    
    const useStatements = [];
    const usePattern = /^use\s+[^;]+;/gm;
    let match;
    while ((match = usePattern.exec(userCode)) !== null) {
      useStatements.push(match[0].trim());
    }
    
    userCode = userCode.replace(/^use\s+[^;]+;/gm, '').trim();
    
    const escapedVendorPath = vendorPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const useStatementsBlock = useStatements.length > 0 ? useStatements.join('\n') + '\n\n' : '';
    const scriptHeader = `<?php
${useStatementsBlock}// Setup autoloader for Composer packages
$vendorPath = '${escapedVendorPath}';
if (file_exists($vendorPath . '/autoload.php')) {
    require_once $vendorPath . '/autoload.php';
}

ob_start();
$__output = array();
$__errors = array();

set_error_handler(function($severity, $message, $file, $line) use (&$__errors) {
    if ($severity === E_WARNING && strpos($message, 'Undefined variable') !== false) {
        return true;
    }
    $__errors[] = array(
        'type' => 'error',
        'message' => $message,
        'line' => $line,
        'file' => $file
    );
    return false;
});

$__magicResults = array();

try {
`;

    const magicCommentsEval = magicComments && magicComments.length > 0 ? magicComments.map(mc => {
      const escapedExprForDisplay = mc.expression
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
      
      const escapedExprForString = mc.expression
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
      
      let exprForCode = mc.expression.trim();
      const isSimpleVariable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(exprForCode) && !exprForCode.startsWith('$');
      
      if (isSimpleVariable) {
        exprForCode = '$' + exprForCode;
        const escapedExprForCode = exprForCode
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "\\'");
        
        const lineNum = mc.line;
        const exprForPHPString = escapedExprForString.replace(/'/g, "\\'");
        const arrayLinePart = 'array(' + 
          '\'line\' => ' + lineNum + ', ' +
          '\'expression\' => \'' + exprForPHPString + '\', ' +
          '\'value\' => $__magicSerialized' +
        ')';
        const arrayErrorPart = 'array(' + 
          '\'line\' => ' + lineNum + ', ' +
          '\'expression\' => \'' + exprForPHPString + '\', ' +
          '\'value\' => null, ' +
          '\'error\' => $e->getMessage()' +
        ')';
        return '    // Magic comment evaluation for line ' + lineNum + ': ' + escapedExprForDisplay + '\n' +
               '    try {\n' +
               '        $__magicEval = @' + escapedExprForCode + ';\n' +
               '        $__magicSerialized = null;\n' +
               '        if (is_object($__magicEval) || is_array($__magicEval)) {\n' +
               '            $__magicSerialized = json_decode(json_encode($__magicEval), true);\n' +
               '        } else {\n' +
               '            $__magicSerialized = $__magicEval;\n' +
               '        }\n' +
               '        $__magicResults[] = ' + arrayLinePart + ';\n' +
               '    } catch (Exception $e) {\n' +
               '        $__magicResults[] = ' + arrayErrorPart + ';\n' +
               '    }';
      } else {
        const lineNum = mc.line;
        return '    // Magic comment skipped for line ' + lineNum + ': complex expression not supported';
      }
    }).filter(x => x !== undefined && x !== null).join('\n') : '';

    const safeMagicCommentsEval = magicCommentsEval || '';
    const scriptFooter = safeMagicCommentsEval + (safeMagicCommentsEval ? '\n' : '') +
      '    \n' +
      '    $capturedOutput = ob_get_clean();\n' +
      '    \n' +
      '    $outputLines = array();\n' +
      '    if (!empty($capturedOutput)) {\n' +
      '        $lines = explode("\\n", trim($capturedOutput));\n' +
      '        foreach ($lines as $line) {\n' +
      '            if (!empty(trim($line))) {\n' +
      '                $outputLines[] = array(\'type\' => \'log\', \'args\' => $line);\n' +
      '            }\n' +
      '        }\n' +
      '    }\n' +
      '    \n' +
      '    $__result = array(\n' +
      '        \'output\' => $outputLines,\n' +
      '        \'error\' => empty($__errors) ? null : array(\n' +
      '            \'message\' => implode("\\n", array_map(function($e) { return $e["message"]; }, $__errors)),\n' +
      '            \'stack\' => null\n' +
      '        ),\n' +
      '        \'value\' => null,\n' +
      '        \'magicComments\' => $__magicResults\n' +
      '    );\n' +
      '    \n' +
      '} catch (Throwable $e) {\n' +
      '    $__result = array(\n' +
      '        \'output\' => array(),\n' +
      '        \'error\' => array(\n' +
      '            \'message\' => $e->getMessage(),\n' +
      '            \'stack\' => $e->getTraceAsString(),\n' +
      '            \'name\' => get_class($e)\n' +
      '        ),\n' +
      '        \'value\' => null,\n' +
      '        \'magicComments\' => array()\n' +
      '    );\n' +
      '}\n' +
      '\n' +
      'echo "__FASTTINKER_PHP_RESULT_START__\\n";\n' +
      'echo json_encode($__result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);\n' +
      'echo "\\n__FASTTINKER_PHP_RESULT_END__\\n";\n';

    const execScript = scriptHeader + userCode + scriptFooter;
    const scriptPath = path.join(require('os').tmpdir(), `fasttinker-php-${execId}.php`);
    
    fs.writeFile(scriptPath, execScript, 'utf-8').then(async () => {
      const phpExecutable = await findPHPExecutable();
      
      const env = { 
        ...process.env,
        COMPOSER_HOME: userDataPath
      };
      
      const phpProcess = spawn(phpExecutable, [scriptPath], {
        env: env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      executionProcesses.set(execId, phpProcess);
      
      let stdout = '';
      let stderr = '';
      
      phpProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      phpProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      phpProcess.on('close', (code) => {
        executionProcesses.delete(execId);
        const hasParseError = stderr && stderr.includes('Parse error');
        if (!hasParseError) {
          fs.unlink(scriptPath).catch(() => {});
        }
        
        try {
          const resultStart1 = stdout.indexOf('__FASTTINKER_PHP_RESULT_START__\n');
          const resultStart2 = stdout.indexOf('__FASTTINKER_PHP_RESULT_START__');
          let resultStart = resultStart1 !== -1 ? resultStart1 : resultStart2;
          let resultEnd = -1;
          
          if (resultStart !== -1) {
            const searchStart = resultStart + '__FASTTINKER_PHP_RESULT_START__'.length;
            const resultEnd1 = stdout.indexOf('\n__FASTTINKER_PHP_RESULT_END__', searchStart);
            const resultEnd2 = stdout.indexOf('__FASTTINKER_PHP_RESULT_END__', searchStart);
            resultEnd = resultEnd1 !== -1 ? resultEnd1 : resultEnd2;
          }
          
          if (resultStart !== -1 && resultEnd !== -1) {
            let jsonStart = resultStart + '__FASTTINKER_PHP_RESULT_START__'.length;
            if (stdout[jsonStart] === '\n') {
              jsonStart++;
            }
            const jsonStr = stdout.substring(jsonStart, resultEnd).trim();
            const result = JSON.parse(jsonStr);
            resolve(result);
          } else if (stderr && !stdout.includes('__FASTTINKER_PHP_RESULT_START__')) {
            resolve({ output: [], error: { message: stderr }, value: undefined });
          } else {
            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const result = JSON.parse(jsonMatch[0]);
                resolve(result);
              } catch (parseErr) {
                resolve({ output: [], error: { message: 'Failed to parse execution result. Output: ' + stdout.substring(0, 200) }, value: undefined });
              }
            } else {
              if (stdout.trim()) {
                resolve({ output: [{ type: 'log', args: stdout.trim() }], error: null, value: undefined, magicComments: [] });
              } else if (stderr.trim()) {
                resolve({ output: [], error: { message: stderr.trim() }, value: undefined });
              } else {
                resolve({ output: [], error: { message: 'Execution returned no output.' }, value: undefined });
              }
            }
          }
        } catch (e) {
          console.error('Error parsing execution result:', e);
          resolve({ output: [], error: { message: e.message || 'Execution failed: ' + (stderr || stdout.substring(0, 200)) }, value: undefined });
        }
      });
      
      phpProcess.on('error', (error) => {
        executionProcesses.delete(execId);
        fs.unlink(scriptPath).catch(() => {});
        
        let errorMessage = error.message;
        if (error.code === 'ENOENT') {
          errorMessage = `PHP not found. Please install PHP and ensure it is accessible.\n\nTried: ${phpExecutable}`;
        }
        
        resolve({ output: [], error: { message: errorMessage, code: error.code }, value: undefined });
      });
    }).catch(err => {
      resolve({ output: [], error: { message: err.message }, value: undefined });
    });
  });
}

// Main execute-code handler that routes to appropriate language handler
ipcMain.handle('execute-code', async (event, code, userDataPath, magicComments = [], language = 'javascript') => {
  const langConfig = LANGUAGES[language];
  if (!langConfig) {
    return { output: [], error: { message: 'Unsupported language: ' + language }, value: undefined };
  }

  if (language === 'javascript') {
    return await executeJavaScript(code, userDataPath, magicComments);
  } else if (language === 'php') {
    return await executePHP(code, userDataPath, magicComments);
  }
  
  return { output: [], error: { message: 'Language handler not implemented' }, value: undefined };
});

ipcMain.handle('stop-execution', async () => {
  executionProcesses.forEach((process) => {
    try {
      process.kill();
    } catch (e) {
      // Ignore errors
    }
  });
  executionProcesses.clear();
  return { success: true };
});

