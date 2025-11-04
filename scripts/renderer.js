let editors = [];
let currentTabIndex = 0;
let settings = {};
let executionAbortController = null;
let outputPanelVisible = true;
let outputPanelWidth = 300;
let tabSnippets = {}; // Track snippet name per tab: { tabId: snippetName }
let currentLanguage = 'javascript'; // Current selected language
let supportedLanguages = {}; // Language configurations

async function initializeApp() {
  try {
    console.log('Initializing fastTinker...');
    
    // Check if electronAPI is available
    if (typeof window.electronAPI === 'undefined') {
      console.error('electronAPI is not available! Check preload script.');
      document.getElementById('output-content').innerHTML = 
        '<div class="error">Electron API not available. Please check the console for errors.</div>';
      // Still set up basic event listeners so UI doesn't appear completely broken
      setupBasicEventListeners();
      return;
    }
    
    // Load supported languages
    try {
      const languages = await window.electronAPI.getSupportedLanguages();
      languages.forEach(lang => {
        supportedLanguages[lang.id] = lang;
      });
      console.log('Supported languages loaded:', Object.keys(supportedLanguages));
    } catch (error) {
      console.error('Error loading languages:', error);
      // Default fallback
      supportedLanguages = {
        'javascript': { id: 'javascript', name: 'JavaScript/TypeScript', defaultExtension: '.js', monacoLanguage: 'javascript' },
        'php': { id: 'php', name: 'PHP', defaultExtension: '.php', monacoLanguage: 'php' }
      };
    }
    
    // Set up language selector
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        updateLanguageUI();
        // Update current editor language and content
        const currentEditor = editors.find(e => e.id === currentTabIndex);
        if (currentEditor) {
          const langConfig = supportedLanguages[currentLanguage];
          if (langConfig) {
            // Update Monaco language mode
            monaco.editor.setModelLanguage(currentEditor.editor.getModel(), langConfig.monacoLanguage);
            // Update editor content to default for the new language
            const defaultContent = getDefaultContentForLanguage(currentLanguage);
            currentEditor.editor.setValue(defaultContent);
            currentEditor.language = currentLanguage; // Update editor's tracked language
            // Update tab name to reflect new language's default extension
            const tab = document.querySelector(`.tab[data-tab="${currentTabIndex}"]`);
            if (tab) {
              const tabNameSpan = tab.querySelector('.tab-name');
              if (tabNameSpan) {
                const defaultExt = langConfig.defaultExtension || '.js';
                tabNameSpan.textContent = `untitled${defaultExt}`;
              }
            }
          }
        }
      });
    }
    
    // Check if Monaco is available
    if (typeof monaco === 'undefined') {
      console.error('Monaco Editor is not loaded!');
      document.getElementById('output-content').innerHTML = 
        '<div class="error">Monaco Editor failed to load. Please check the console for errors.</div>';
      // Still set up event listeners for other buttons
      setupBasicEventListeners();
      return;
    }
    
    // Load settings
    try {
      settings = await window.electronAPI.loadSettings();
      console.log('Settings loaded');
    } catch (error) {
      console.error('Error loading settings:', error);
      settings = {};
    }
    
    // Initialize Monaco Editor
    try {
      initializeEditor();
      console.log('Editor initialized');
    } catch (error) {
      console.error('Error initializing editor:', error);
      document.getElementById('output-content').innerHTML = 
        '<div class="error">Failed to initialize editor: ' + error.message + '</div>';
      return;
    }
    
    // Setup event listeners
    try {
      setupEventListeners();
      console.log('Event listeners set up');
    } catch (error) {
      console.error('Error setting up event listeners:', error);
      // Try basic event listeners as fallback
      setupBasicEventListeners();
    }
    
    // Ensure side panels are hidden on startup
    const sidePanels = document.getElementById('side-panels');
    if (sidePanels) {
      sidePanels.classList.remove('visible');
      document.querySelectorAll('.side-panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });
      document.querySelectorAll('.activity-btn').forEach(btn => btn.classList.remove('active'));
    }
    
    // Setup splitter
    setupSplitter();
    
    // Load snippets
    await loadSnippets();
    
    // Initialize settings UI
    initializeSettingsUI();
    
    // Apply settings to editor
    applySettings();
    
    // Load installed packages initially
    loadInstalledPackages();
    
    console.log('fastTinker initialized successfully');
    
    // Test that buttons are clickable
    console.log('Testing button elements...');
    const testBtn = document.getElementById('run-btn');
    if (testBtn) {
      console.log('Run button found:', testBtn);
      // Add a test click handler
      testBtn.addEventListener('click', () => {
        console.log('RUN BUTTON CLICKED - Event listeners are working!');
      }, { once: true });
    } else {
      console.error('Run button not found!');
    }
  } catch (error) {
    console.error('Fatal error initializing app:', error);
    console.error('Error stack:', error.stack);
    const outputContent = document.getElementById('output-content');
    if (outputContent) {
      outputContent.innerHTML = 
        '<div class="error">Fatal error: ' + error.message + '</div>';
    }
  }
}

// Toggle panel function (needed by setupBasicEventListeners)
function togglePanel(panelName) {
  console.log('togglePanel called with:', panelName);
  const panels = document.getElementById('side-panels');
  const panel = document.getElementById(`${panelName}-panel`);
  const btn = document.getElementById(`${panelName}-btn`);
  
  console.log('Panel elements:', { panels, panel, btn });
  
  if (!panels || !panel || !btn) {
    console.error('Panel elements not found:', panelName, { panels, panel, btn });
    return;
  }
  
  if (panel.classList.contains('active')) {
    console.log('Hiding panel:', panelName);
    panel.classList.remove('active');
    panel.style.display = 'none';
    panels.classList.remove('visible');
    panels.style.transform = 'translateX(100%)';
    btn.classList.remove('active');
  } else {
    console.log('Showing panel:', panelName);
    // Hide all panels
    document.querySelectorAll('.side-panel').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });
    // Show selected panel
    panel.classList.add('active');
    panel.style.display = 'flex';
    panels.classList.add('visible');
    panels.style.transform = 'translateX(0)';
    btn.classList.add('active');
  }
}

// Set up basic event listeners even if Monaco fails
function setupBasicEventListeners() {
  console.log('Setting up basic event listeners...');
  const runBtn = document.getElementById('run-btn');
  if (runBtn) {
    runBtn.addEventListener('click', function() {
      console.log('Run button clicked (Monaco not loaded)');
      const outputContent = document.getElementById('output-content');
      if (outputContent) {
        outputContent.innerHTML = 
          '<div class="error">Monaco Editor is not loaded. Cannot execute code.</div>';
      }
    });
  }
  
  // Set up other buttons
  const snippetsBtn = document.getElementById('snippets-btn');
  if (snippetsBtn) {
    snippetsBtn.addEventListener('click', function() {
      console.log('Snippets button clicked');
      togglePanel('snippets');
    });
  }
  
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', function() {
      console.log('Settings button clicked');
      togglePanel('settings');
    });
  }
  
  
  // Close panel buttons
  document.querySelectorAll('.close-panel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const closeBtn = e.currentTarget || e.target.closest('.close-panel') || e.target;
      const panel = closeBtn.dataset.panel;
      console.log('Close panel clicked:', panel);
      if (panel) {
        togglePanel(panel);
      }
    });
  });
}

// Ensure modal is hidden on startup and prevent it from blocking
(function() {
  function ensureModalHidden() {
    const modal = document.getElementById('input-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.style.pointerEvents = 'none';
    }
  }
  
  // Try immediately
  ensureModalHidden();
  
  // Also try when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureModalHidden);
  }
  
  // Call initializeApp when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureModalHidden();
      console.log('DOM loaded, initializing app...');
      initializeApp();
    });
  } else {
    // DOM is already ready
    console.log('DOM already ready, initializing app...');
    ensureModalHidden();
    initializeApp();
  }
})();

// Get default content for a given language
function getDefaultContentForLanguage(language) {
  if (language === 'php') {
    return `<?php
// Welcome to fastTinker!
// This is a PHP playground

echo "Hello, World!\n";

// Try using magic comments to see values inline:
$x = 42; // $x
$y = [1, 2, 3]; // $y

// PHP version information
echo "PHP version: " . PHP_VERSION . "\n";
`;
  } else {
    // Default to JavaScript/TypeScript
    return `// Welcome to fastTinker!
// This is a JavaScript/TypeScript playground

console.log('Hello, World!');

// Try using magic comments to see values inline:
const x = 42; // $x
const y = [1, 2, 3]; // $y

// You have access to both Node.js and browser APIs
console.log('Node.js version:', process.version);

// Install NPM packages from the terminal or use require() to try loading them
`;
  }
}

function initializeEditor() {
  const mainContainer = document.getElementById('editor-container');
  
  if (!mainContainer) {
    console.error('Editor container not found!');
    return;
  }
  
  // Create a container for the first editor
  const editorContainer = document.createElement('div');
  editorContainer.id = `editor-container-${currentTabIndex}`;
  editorContainer.style.width = '100%';
  editorContainer.style.height = '100%';
  editorContainer.style.position = 'relative';
  editorContainer.style.pointerEvents = 'auto';
  mainContainer.appendChild(editorContainer);
  
  // Get default content based on current language
  const langConfig = supportedLanguages[currentLanguage] || supportedLanguages['javascript'];
  const defaultContent = getDefaultContentForLanguage(currentLanguage);
  const monacoLang = langConfig.monacoLanguage || 'javascript';
  
  const editor = monaco.editor.create(editorContainer, {
    value: defaultContent,
    language: monacoLang,
    theme: 'vs-dark',
    fontSize: 14,
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: settings.general?.lineWrap ? 'on' : 'off',
    autoClosingBrackets: settings.general?.closeBrackets ? 'always' : 'never',
    matchBrackets: settings.general?.matchLines ? 'always' : 'never',
    quickSuggestions: settings.general?.autocomplete ? {
      other: true,
      comments: false,
      strings: false
    } : false,
    suggestOnTriggerCharacters: settings.general?.autocomplete || false,
    hover: { enabled: settings.general?.hoverInfo || false },
    parameterHints: { enabled: settings.general?.signatures || false }
  });
  
  // Ensure editor is properly laid out and clickable
  setTimeout(() => {
    editor.layout();
    editor.focus();
  }, 100);

  // Setup editor change detection for auto-run
  const changeListener = editor.onDidChangeModelContent(() => {
    if (settings.general?.autoRun) {
      debounceExecute(1000);
    }
  });

  // Handle Ctrl+Enter for execution
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    executeCode();
  });

  // Use the langConfig already declared above
  const defaultExt = langConfig.defaultExtension || '.js';
  const defaultName = `untitled${defaultExt}`;
  
  editors.push({
    editor: editor,
    id: currentTabIndex,
    name: defaultName,
    language: currentLanguage,
    container: editorContainer,
    changeListener: changeListener
  });
  
  // Update tab name
  const tab = document.querySelector(`.tab[data-tab="${currentTabIndex}"]`);
  if (tab) {
    const tabNameSpan = tab.querySelector('.tab-name');
    if (tabNameSpan) {
      tabNameSpan.textContent = defaultName;
    }
  }
}

function setupEventListeners() {
  // Run button
  const runBtn = document.getElementById('run-btn');
  if (runBtn) {
    runBtn.addEventListener('click', executeCode);
  }
  
  // Stop button
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.addEventListener('click', stopExecution);
  }
  
  // New tab button
  const newTabBtn = document.getElementById('new-tab-btn');
  if (newTabBtn) {
    newTabBtn.addEventListener('click', createNewTab);
  }
  
  // Tab interactions - improved event delegation
  document.addEventListener('click', (e) => {
    // Check for tab close button click
    const closeBtn = e.target.closest('.tab-close');
    if (closeBtn) {
      e.stopPropagation();
      const tabId = parseInt(closeBtn.dataset.tab);
      if (!isNaN(tabId)) {
        closeTab(tabId);
      }
      return;
    }
    
    // Check for tab click (but not on close button)
    const tab = e.target.closest('.tab');
    if (tab && !e.target.closest('.tab-close')) {
      e.stopPropagation();
      const tabId = parseInt(tab.dataset.tab);
      if (!isNaN(tabId)) {
        switchTab(tabId);
      }
      return;
    }
  });
  
  // Activity bar buttons
  const snippetsBtn = document.getElementById('snippets-btn');
  if (snippetsBtn) {
    console.log('Snippets button found, adding event listener');
    snippetsBtn.addEventListener('click', (e) => {
      console.log('Snippets button clicked!', e);
      e.preventDefault();
      e.stopPropagation();
      togglePanel('snippets');
    });
  } else {
    console.error('Snippets button not found!');
  }
  
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    console.log('Settings button found, adding event listener');
    settingsBtn.addEventListener('click', (e) => {
      console.log('Settings button clicked!', e);
      e.preventDefault();
      e.stopPropagation();
      togglePanel('settings');
    });
  } else {
    console.error('Settings button not found!');
  }
  
  // Close panel buttons
  document.querySelectorAll('.close-panel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const closeBtn = e.currentTarget || e.target.closest('.close-panel') || e.target;
      const panel = closeBtn.dataset.panel;
      console.log('Close panel clicked:', panel);
      if (panel) {
        togglePanel(panel);
      }
    });
  });
  
  // Output toggle
  const toggleOutputBtn = document.getElementById('toggle-output');
  if (toggleOutputBtn) {
    toggleOutputBtn.addEventListener('click', toggleOutputPanel);
  }
  
  // Snippets
  const newSnippetBtn = document.getElementById('new-snippet-btn');
  if (newSnippetBtn) {
    newSnippetBtn.addEventListener('click', createNewSnippet);
  }
  
  const updateSnippetBtn = document.getElementById('update-snippet-btn');
  if (updateSnippetBtn) {
    updateSnippetBtn.addEventListener('click', updateCurrentSnippet);
  }
  
  // Install package
  const installPackageBtn = document.getElementById('install-package-btn');
  if (installPackageBtn) {
    installPackageBtn.addEventListener('click', installPackage);
  }
  
  // Load installed packages
  loadInstalledPackages();
}

function setupSplitter() {
  const splitter = document.getElementById('splitter');
  const editorPanel = document.getElementById('editor-panel');
  const outputPanel = document.getElementById('output-panel');
  
  if (!splitter || !editorPanel || !outputPanel) {
    console.error('Splitter elements not found');
    return;
  }
  
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  splitter.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = outputPanelWidth;
    splitter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const delta = startX - e.clientX;
    const newWidth = Math.max(200, Math.min(800, startWidth + delta));
    outputPanelWidth = newWidth;
    outputPanel.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      splitter.classList.remove('dragging');
      document.body.style.cursor = '';
    }
  });
}

async function executeCode() {
  // Find editor by ID, not array index
  const currentEditor = editors.find(e => e.id === currentTabIndex);
  if (!currentEditor) {
    console.error('No editor found for tab:', currentTabIndex);
    return;
  }

  const code = currentEditor.editor.getValue();
  const outputContent = document.getElementById('output-content');
  
  // Show stop button
  document.getElementById('stop-btn').style.display = 'block';
  document.getElementById('run-btn').style.display = 'none';
  
  // Clear output
  outputContent.innerHTML = '';
  outputContent.classList.remove('error');
  
  // Show output panel
  if (!outputPanelVisible) {
    toggleOutputPanel();
  }

  executionAbortController = new AbortController();
  
  try {
    // Process magic comments and extract expressions
    const processedCode = processMagicComments(code);
    
    // Auto-log expressions: wrap standalone expressions (only for JavaScript/TypeScript)
    let autoLoggedCode = processedCode.code;
    if (currentLanguage === 'javascript') {
      autoLoggedCode = autoLogExpressions(processedCode.code);
    } else if (currentLanguage === 'php') {
      autoLoggedCode = autoLogExpressionsPHP(processedCode.code);
    }
    
    // Create execution environment with magic comments info
    const result = await executeInHybridEnvironment(autoLoggedCode, processedCode.magicComments);
    
    // Display results
    displayExecutionResults(result, processedCode.magicComments);
    
  } catch (error) {
    if (error.name !== 'AbortError') {
      displayError(error);
    }
  } finally {
    // Hide stop button
    document.getElementById('stop-btn').style.display = 'none';
    document.getElementById('run-btn').style.display = 'block';
    executionAbortController = null;
  }
}

// Auto-log expressions: automatically wrap standalone expressions in console.log()
function autoLogExpressions(code) {
  if (!code || !code.trim()) return code;
  
  const lines = code.split('\n');
  const processedLines = [];
  let inMultiLineComment = false;
  let braceDepth = 0;
  let parenDepth = 0;
  
  // Keywords that indicate a statement is not a standalone expression
  const statementKeywords = new Set([
    'const', 'let', 'var', 'function', 'class', 'if', 'else', 'for', 'while', 
    'do', 'switch', 'case', 'default', 'try', 'catch', 'finally', 'throw', 
    'return', 'break', 'continue', 'import', 'export', 'async', 'await', 'yield',
    'debugger', 'with', 'enum', 'interface', 'type', 'namespace'
  ]);
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//')) {
      processedLines.push(line);
      continue;
    }
    
    // Check for multi-line comments
    if (trimmed.includes('/*')) {
      inMultiLineComment = true;
      processedLines.push(line);
      if (trimmed.includes('*/')) {
        inMultiLineComment = false;
      }
      continue;
    }
    
    if (trimmed.includes('*/')) {
      inMultiLineComment = false;
      processedLines.push(line);
      continue;
    }
    
    if (inMultiLineComment) {
      processedLines.push(line);
      continue;
    }
    
    // Count braces and parentheses to determine if we're inside a block
    let lineBraceDepth = 0;
    let lineParenDepth = 0;
    for (const char of line) {
      if (char === '{') lineBraceDepth++;
      if (char === '}') lineBraceDepth--;
      if (char === '(') lineParenDepth++;
      if (char === ')') lineParenDepth--;
    }
    braceDepth += lineBraceDepth;
    parenDepth += lineParenDepth;
    
    // Skip lines that are clearly statements (declarations, control flow, etc.)
    const firstWord = trimmed.split(/\s|\(/)[0];
    if (statementKeywords.has(firstWord) || 
        trimmed.startsWith('{') || 
        trimmed.startsWith('}') ||
        trimmed.endsWith('{') ||
        (trimmed.includes(':') && !trimmed.includes('?'))) { // object property, not ternary
      processedLines.push(line);
      continue;
    }
    
    // Check if line is an assignment/declaration
    const hasAssignment = /=\s*[^=]/.test(trimmed) && !trimmed.includes('==') && !trimmed.includes('===') && !trimmed.includes('!=') && !trimmed.includes('!==') && !trimmed.includes('=>');
    
    // Remove semicolon for detection purposes (we'll add it back when wrapping)
    const withoutSemicolon = trimmed.replace(/;$/, '');
    
    // If it's a standalone expression (not an assignment, not in a block/function call)
    if (!hasAssignment && braceDepth <= 0 && parenDepth <= 0) {
      // Check if it looks like an expression (variable, function call, property access, etc.)
      // Pattern: identifier, optionally followed by property access, array access, or function calls
      const expressionPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*|\[[^\]]*\]|\([^)]*\))*(\.[a-zA-Z_$][a-zA-Z0-9_$]*|\[[^\]]*\]|\([^)]*\))*$/;
      const looksLikeExpression = expressionPattern.test(withoutSemicolon) || 
                                  /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(withoutSemicolon); // simple variable name
      
      if (looksLikeExpression && withoutSemicolon.length > 0 && !trimmed.match(/^(if|for|while|switch|catch|function|class|const|let|var|return|break|continue|throw|try|else|case|default|async|await|yield|import|export)/)) {
        // Don't auto-log console.log calls themselves (they already log)
        if (withoutSemicolon.trim().startsWith('console.log') || withoutSemicolon.trim().startsWith('console.error') || withoutSemicolon.trim().startsWith('console.warn') || withoutSemicolon.trim().startsWith('console.info')) {
          processedLines.push(line);
          continue;
        }
        // Wrap in console.log, preserving original indentation
        const indent = line.match(/^\s*/)[0];
        processedLines.push(indent + `console.log(${withoutSemicolon});`);
        continue;
      }
    }
    
    processedLines.push(line);
  }
  
  return processedLines.join('\n');
}

// Auto-log expressions for PHP: automatically wrap standalone expressions in echo/print_r()
function autoLogExpressionsPHP(code) {
  if (!code || !code.trim()) return code;
  
  const lines = code.split('\n');
  const processedLines = [];
  let inMultiLineComment = false;
  let braceDepth = 0;
  let parenDepth = 0;
  
  // Keywords that indicate a statement is not a standalone expression
  const statementKeywords = new Set([
    'function', 'class', 'if', 'else', 'elseif', 'for', 'foreach', 'while', 
    'do', 'switch', 'case', 'default', 'try', 'catch', 'finally', 'throw', 
    'return', 'break', 'continue', 'goto', 'declare', 'namespace', 'use',
    'abstract', 'final', 'private', 'public', 'protected', 'static', 'const',
    'require', 'require_once', 'include', 'include_once', 'echo', 'print',
    'print_r', 'var_dump', 'var_export'
  ]);
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//')) {
      processedLines.push(line);
      continue;
    }
    
    // Check for multi-line comments
    if (trimmed.includes('/*')) {
      inMultiLineComment = true;
      processedLines.push(line);
      if (trimmed.includes('*/')) {
        inMultiLineComment = false;
      }
      continue;
    }
    
    if (trimmed.includes('*/')) {
      inMultiLineComment = false;
      processedLines.push(line);
      continue;
    }
    
    if (inMultiLineComment) {
      processedLines.push(line);
      continue;
    }
    
    // Count braces and parentheses to determine if we're inside a block
    let lineBraceDepth = 0;
    let lineParenDepth = 0;
    for (const char of line) {
      if (char === '{') lineBraceDepth++;
      if (char === '}') lineBraceDepth--;
      if (char === '(') lineParenDepth++;
      if (char === ')') lineParenDepth--;
    }
    braceDepth += lineBraceDepth;
    parenDepth += lineParenDepth;
    
    // Skip lines that are clearly statements (declarations, control flow, etc.)
    const firstWord = trimmed.split(/\s|\(/)[0];
    if (statementKeywords.has(firstWord) || 
        trimmed.startsWith('{') || 
        trimmed.startsWith('}') ||
        trimmed.endsWith('{') ||
        (trimmed.includes(':') && !trimmed.includes('?'))) { // object property, not ternary
      processedLines.push(line);
      continue;
    }
    
    // Check if line is an assignment/declaration
    // PHP assignments: $var = value, $var->prop = value, $var['key'] = value
    const hasAssignment = /=\s*[^=]/.test(trimmed) && 
                          !trimmed.includes('==') && 
                          !trimmed.includes('===') && 
                          !trimmed.includes('!=') && 
                          !trimmed.includes('!==') && 
                          !trimmed.includes('=>') && // array key-value pairs
                          !trimmed.includes('<=>'); // spaceship operator
    
    // Remove semicolon for detection purposes (we'll add it back when wrapping)
    const withoutSemicolon = trimmed.replace(/;$/, '');
    
    // If it's a standalone expression (not an assignment, not in a block/function call)
    if (!hasAssignment && braceDepth <= 0 && parenDepth <= 0) {
      // Check if it looks like a PHP expression
      // PHP variables start with $, can have -> for method calls, [] for array access
      // Pattern: $var, $var->method(), $var['key'], $var->prop, etc.
      const phpExpressionPattern = /^\$[a-zA-Z_][a-zA-Z0-9_]*(->[a-zA-Z_][a-zA-Z0-9_]*(\[.*?\]|\([^)]*\))*|\[[^\]]*\]|\([^)]*\))*(->[a-zA-Z_][a-zA-Z0-9_]*(\[.*?\]|\([^)]*\))*|\[[^\]]*\]|\([^)]*\))*$/;
      const looksLikeExpression = phpExpressionPattern.test(withoutSemicolon) || 
                                  /^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(withoutSemicolon); // simple variable name
      
      if (looksLikeExpression && withoutSemicolon.length > 0) {
        // Don't auto-log echo/print calls themselves (they already output)
        const exprTrimmed = withoutSemicolon.trim();
        if (exprTrimmed.startsWith('echo') || 
            exprTrimmed.startsWith('print') || 
            exprTrimmed.startsWith('print_r') || 
            exprTrimmed.startsWith('var_dump') || 
            exprTrimmed.startsWith('var_export')) {
          processedLines.push(line);
          continue;
        }
        
        // For simple variables, use echo with var_export for better output
        // For complex expressions (method calls, etc.), use print_r with echo
        const indent = line.match(/^\s*/)[0];
        const isSimpleVar = /^\$[a-zA-Z_][a-zA-Z0-9_]*$/.test(withoutSemicolon);
        
        if (isSimpleVar) {
          // Simple variable: use var_export for better formatting
          processedLines.push(indent + `echo var_export(${withoutSemicolon}, true) . "\\n";`);
        } else {
          // Complex expression: use print_r for better output
          processedLines.push(indent + `echo print_r(${withoutSemicolon}, true) . "\\n";`);
        }
        continue;
      }
    }
    
    processedLines.push(line);
  }
  
  return processedLines.join('\n');
}

function processMagicComments(code) {
  const magicComments = [];
  const lines = code.split('\n');
  const processedLines = [];
  
  lines.forEach((line, index) => {
    // Match magic comment pattern: // $expression
    const magicMatch = line.match(/\/\/\s*\$\s*(.+)/);
    if (magicMatch) {
      const expression = magicMatch[1].trim();
      magicComments.push({
        line: index + 1,
        expression: expression
      });
      // Keep the comment line - we'll evaluate it in the execution script
      processedLines.push(line);
    } else {
      processedLines.push(line);
    }
  });
  
  return {
    code: processedLines.join('\n'),
    magicComments: magicComments
  };
}

async function executeInHybridEnvironment(code, magicComments = []) {
  const userDataPath = await window.electronAPI.getUserDataPath();
  const result = await window.electronAPI.executeCode(code, userDataPath, magicComments, currentLanguage);
  return result;
}

// Helper function to check if value is a plain object (not array, null, Date, etc.)
function isPlainObject(value) {
  return value !== null && 
         typeof value === 'object' && 
         !Array.isArray(value) &&
         Object.prototype.toString.call(value) === '[object Object]';
}

// Helper function to get object key count
function getObjectKeyCount(value) {
  if (isPlainObject(value)) {
    return Object.keys(value).length;
  }
  return null;
}

function displayExecutionResults(result, magicComments) {
  const outputContent = document.getElementById('output-content');
  
  // Display console output
  result.output.forEach(item => {
    const div = document.createElement('div');
    div.className = `log ${item.type}`;
    
    // Try to detect if the output contains an object representation
    // item.args is a formatted string - check if it looks like a JSON object
    try {
      // Try to extract JSON object from the string
      // The string might be multi-line (pretty-printed JSON), so we need to extract it properly
      const trimmed = item.args.trim();
      
      // Check if it starts with { and might contain newlines (pretty-printed JSON)
      if (trimmed.startsWith('{')) {
        // Try to find the matching closing brace, accounting for nested objects
        let braceCount = 0;
        let endIndex = -1;
        for (let i = 0; i < trimmed.length; i++) {
          if (trimmed[i] === '{') braceCount++;
          if (trimmed[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              endIndex = i + 1;
              break;
            }
          }
        }
        
        if (endIndex > 0) {
          // Extract the JSON part (might have extra text after)
          const jsonStr = trimmed.substring(0, endIndex);
          const parsed = JSON.parse(jsonStr);
          if (isPlainObject(parsed)) {
            const count = getObjectKeyCount(parsed);
            const countDiv = document.createElement('div');
            countDiv.className = `log ${item.type}`;
            countDiv.style.fontWeight = 'bold';
            countDiv.style.color = '#4fc1ff';
            countDiv.style.marginBottom = '4px';
            countDiv.textContent = `Object with ${count} ${count === 1 ? 'property' : 'properties'}:`;
            outputContent.appendChild(countDiv);
          }
        }
      }
    } catch (e) {
      // Not a parseable JSON object, continue with normal display
    }
    
    // item.args is already a formatted string, not JSON
    // It was formatted in the execution script
    // Skip displaying if it's just "undefined" (suppress undefined logs)
    if (item.args.trim() === 'undefined') {
      return; // Skip this log entry
    }
    
    div.textContent = item.args;
    outputContent.appendChild(div);
  });
  
  // Display return value if enabled (skip null and undefined)
  if (settings.advanced?.expressionResults && result.value !== undefined && result.value !== null) {
    // Check if value is an object and show count
    if (isPlainObject(result.value)) {
      const count = getObjectKeyCount(result.value);
      const countDiv = document.createElement('div');
      countDiv.className = 'success';
      countDiv.style.fontWeight = 'bold';
      countDiv.style.marginBottom = '4px';
      countDiv.textContent = `→ Object with ${count} ${count === 1 ? 'property' : 'properties'}:`;
      outputContent.appendChild(countDiv);
    }
    
    const div = document.createElement('div');
    div.className = 'success';
    div.textContent = `→ ${JSON.stringify(result.value, null, 2)}`;
    outputContent.appendChild(div);
  }
  
  // Display errors
  if (result.error) {
    displayError(result.error);
  }
  
  // Display magic comments results
  if (result.magicComments && result.magicComments.length > 0) {
    result.magicComments.forEach(mc => {
      const div = document.createElement('div');
      div.className = 'log';
      div.style.marginTop = '8px';
      div.style.paddingLeft = '16px';
      div.style.borderLeft = '2px solid #007acc';
      
      if (mc.error) {
        div.innerHTML = `<strong style="color: #f48771;">Line ${mc.line}: ${mc.expression}</strong> → <span style="color: #f48771;">Error: ${mc.error}</span>`;
      } else {
        try {
          const valueStr = typeof mc.value === 'object' && mc.value !== null 
            ? JSON.stringify(mc.value, null, 2)
            : String(mc.value);
          div.innerHTML = `<strong style="color: #4fc1ff;">Line ${mc.line}: ${mc.expression}</strong> → <code style="color: #cccccc;">${valueStr}</code>`;
        } catch (e) {
          div.innerHTML = `<strong style="color: #4fc1ff;">Line ${mc.line}: ${mc.expression}</strong> → <span style="color: #888;">[Unable to display]</span>`;
        }
      }
      outputContent.appendChild(div);
    });
  } else if (magicComments && magicComments.length > 0) {
    // Fallback: show expressions if magic comments weren't evaluated
    magicComments.forEach(mc => {
      const div = document.createElement('div');
      div.className = 'log';
      div.style.marginTop = '8px';
      div.style.paddingLeft = '16px';
      div.style.borderLeft = '2px solid #007acc';
      div.innerHTML = `<strong style="color: #4fc1ff;">Line ${mc.line}:</strong> <code style="color: #cccccc;">${mc.expression}</code>`;
      outputContent.appendChild(div);
    });
  }
}

function displayError(error) {
  const outputContent = document.getElementById('output-content');
  const div = document.createElement('div');
  div.className = 'error';
  div.textContent = error.message || error;
  if (error.stack) {
    const stackDiv = document.createElement('div');
    stackDiv.style.marginTop = '8px';
    stackDiv.style.fontSize = '12px';
    stackDiv.style.opacity = '0.7';
    stackDiv.textContent = error.stack;
    div.appendChild(stackDiv);
  }
  outputContent.appendChild(div);
  outputContent.classList.add('error');
}

async function stopExecution() {
  if (executionAbortController) {
    executionAbortController.abort();
  }
  await window.electronAPI.stopExecution();
}

function toggleOutputPanel() {
  const panel = document.getElementById('output-panel');
  const toggleBtn = document.getElementById('toggle-output');
  
  if (outputPanelVisible) {
    panel.classList.add('hidden');
    toggleBtn.textContent = '+';
    outputPanelVisible = false;
  } else {
    panel.classList.remove('hidden');
    toggleBtn.textContent = '−';
    outputPanelVisible = true;
  }
}

function createNewTab() {
  try {
    const tabId = ++currentTabIndex;
    const langConfig = supportedLanguages[currentLanguage] || supportedLanguages['javascript'];
    const defaultExt = langConfig.defaultExtension || '.js';
    const defaultName = `untitled${defaultExt}`;
    const monacoLang = langConfig.monacoLanguage || 'javascript';
    
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.tab = tabId;
    tab.innerHTML = `
      <span class="tab-name">${defaultName}</span>
      <button class="tab-close" data-tab="${tabId}" title="Close">×</button>
    `;
    
    document.getElementById('tabs-container').appendChild(tab);
    
    // Check if Monaco is available
    if (typeof monaco === 'undefined') {
      console.error('Monaco not available for new tab');
      return;
    }
    
    // Create a separate container for each editor
    const mainContainer = document.getElementById('editor-container');
    
    // Create individual container for this editor
    const editorContainer = document.createElement('div');
    editorContainer.id = `editor-container-${tabId}`;
    editorContainer.style.width = '100%';
    editorContainer.style.height = '100%';
    editorContainer.style.display = 'none'; // Hide by default
    editorContainer.style.position = 'relative';
    editorContainer.style.pointerEvents = 'auto';
    mainContainer.appendChild(editorContainer);
    
    const defaultContent = getDefaultContentForLanguage(currentLanguage);
    
    const editor = monaco.editor.create(editorContainer, {
      value: defaultContent,
      language: monacoLang,
      theme: 'vs-dark',
      fontSize: 14,
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: settings.general?.lineWrap ? 'on' : 'off',
      autoClosingBrackets: settings.general?.closeBrackets ? 'always' : 'never',
      matchBrackets: settings.general?.matchLines ? 'always' : 'never'
    });
    
    // Ensure editor is properly laid out and clickable
    setTimeout(() => {
      editor.layout();
    }, 100);
    
    // Setup editor change detection for auto-run
    const changeListener = editor.onDidChangeModelContent(() => {
      if (settings.general?.autoRun) {
        debounceExecute(1000);
      }
    });

    // Handle Ctrl+Enter for execution
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      executeCode();
    });
    
    // Hide all other editors
    editors.forEach(e => {
      const container = document.getElementById(`editor-container-${e.id}`);
      if (container) container.style.display = 'none';
    });
    
    // Show new editor
    editorContainer.style.display = 'block';
    
    editors.push({
      editor: editor,
      id: tabId,
      name: defaultName,
      language: currentLanguage,
      container: editorContainer,
      changeListener: changeListener
    });
    
    // Focus the editor
    setTimeout(() => {
      editor.focus();
    }, 100);
    
    switchTab(tabId);
    console.log('New tab created:', tabId);
  } catch (error) {
    console.error('Error creating new tab:', error);
  }
}

function switchTab(tabId) {
  currentTabIndex = tabId;
  
  // Update tab UI
  document.querySelectorAll('.tab').forEach(t => {
    if (parseInt(t.dataset.tab) === tabId) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
  
  // Show/hide editors using their containers
  editors.forEach(e => {
    const container = e.container || document.getElementById(`editor-container-${e.id}`);
    if (e.id === tabId) {
      if (container) container.style.display = 'block';
      // Layout and focus the editor
      setTimeout(() => {
        e.editor.layout();
        e.editor.focus();
      }, 50);
    } else {
      if (container) container.style.display = 'none';
    }
  });
  
  // Update the "Update Snippet" button visibility based on current tab
  updateSnippetButtonVisibility();
}

// Update snippet button visibility based on current tab
function updateSnippetButtonVisibility() {
  const updateBtn = document.getElementById('update-snippet-btn');
  if (!updateBtn) return; // Button might not exist yet
  
  const snippetName = tabSnippets[currentTabIndex];
  if (snippetName) {
    updateBtn.style.display = 'block';
  } else {
    updateBtn.style.display = 'none';
  }
}

function closeTab(tabId) {
  if (editors.length <= 1) {
    console.log('Cannot close the last tab');
    return; // Don't close the last tab
  }
  
  const editorIndex = editors.findIndex(e => e.id === tabId);
  if (editorIndex === -1) {
    console.log('Tab not found:', tabId);
    return;
  }
  
  try {
    // Remove editor
    const editorData = editors[editorIndex];
    editorData.editor.dispose();
    
    // Remove the editor container
    const container = editorData.container || document.getElementById(`editor-container-${tabId}`);
    if (container) {
      container.remove();
    }
    
    // Remove snippet tracking for this tab
    delete tabSnippets[tabId];
    
    editors.splice(editorIndex, 1);
    
    // Remove tab
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (tab) tab.remove();
    
    // Switch to another tab
    if (editors.length > 0) {
      const newTabId = editors[0].id;
      switchTab(newTabId);
    }
    console.log('Tab closed:', tabId);
  } catch (error) {
    console.error('Error closing tab:', error);
  }
}

// togglePanel function is defined earlier in the file

// Update UI elements based on current language
function updateLanguageUI() {
  const langConfig = supportedLanguages[currentLanguage] || supportedLanguages['javascript'];
  const packageManager = langConfig.packageManager || 'npm';
  
  // Update package manager title
  const packageTitle = document.getElementById('package-manager-title');
  if (packageTitle) {
    packageTitle.textContent = packageManager === 'npm' ? 'NPM Packages' : 'Composer Packages';
  }
  
  // Reload snippets and packages for the new language
  loadSnippets();
  loadInstalledPackages();
}

async function loadSnippets() {
  const snippets = await window.electronAPI.listSnippets(currentLanguage);
  const list = document.getElementById('snippets-list');
  list.innerHTML = '';
  
  const langConfig = supportedLanguages[currentLanguage] || supportedLanguages['javascript'];
  const extensions = langConfig.extensions || ['.js', '.ts'];
  const extensionPattern = extensions.map(ext => ext.replace('.', '\\.')).join('|');
  
  snippets.forEach(snippet => {
    // Extract snippet name without extension
    const snippetName = snippet.replace(new RegExp(`\\.(${extensionPattern})$`), '');
    const item = document.createElement('div');
    item.className = 'snippet-item';
    item.innerHTML = `
      <span class="snippet-name">${snippetName}</span>
      <div class="snippet-actions">
        <button class="snippet-btn" onclick="loadSnippet('${snippet}')" title="Load">📄</button>
        <button class="snippet-btn" onclick="editSnippet('${snippetName}')" title="Edit">✏️</button>
        <button class="snippet-btn" onclick="deleteSnippet('${snippetName}')" title="Delete">🗑</button>
      </div>
    `;
    list.appendChild(item);
  });
}

// Helper function to show input modal
function showInputModal(title, placeholder = 'Enter value...') {
  return new Promise((resolve) => {
    console.log('showInputModal called with:', title, placeholder);
    const modal = document.getElementById('input-modal');
    const titleEl = document.getElementById('modal-title');
    const inputEl = document.getElementById('modal-input');
    const okBtn = document.getElementById('modal-ok');
    const cancelBtn = document.getElementById('modal-cancel');

    if (!modal || !titleEl || !inputEl || !okBtn || !cancelBtn) {
      console.error('Modal elements not found:', { modal, titleEl, inputEl, okBtn, cancelBtn });
      resolve(null);
      return;
    }

    console.log('Setting up modal...');
    titleEl.textContent = title;
    inputEl.placeholder = placeholder;
    inputEl.value = '';
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('pointer-events', 'auto', 'important');
    console.log('Modal displayed, focusing input...');
    inputEl.focus();

    const handleOk = () => {
      console.log('Modal OK clicked');
      const value = inputEl.value.trim();
      console.log('Modal value:', value);
      modal.style.setProperty('display', 'none', 'important');
      modal.style.setProperty('pointer-events', 'none', 'important');
      inputEl.removeEventListener('keypress', handleKeyPress);
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
      resolve(value);
    };

    const handleCancel = () => {
      console.log('Modal Cancel clicked');
      modal.style.setProperty('display', 'none', 'important');
      modal.style.setProperty('pointer-events', 'none', 'important');
      inputEl.removeEventListener('keypress', handleKeyPress);
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
      resolve(null);
    };

    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        handleOk();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    };

    console.log('Adding event listeners to modal buttons');
    inputEl.addEventListener('keypress', handleKeyPress);
    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
    console.log('Modal event listeners added');
  });
}

// Helper function to show confirmation dialog
async function showConfirm(message) {
  const result = await window.electronAPI.showMessageBox({
    type: 'question',
    buttons: ['Yes', 'No'],
    defaultId: 1,
    message: message
  });
  return result.response === 0;
}

window.loadSnippet = async function(snippetName) {
  // Get user data path and construct snippet path using string concatenation
  // (since require('path') doesn't work reliably in renderer)
  const userDataPath = await window.electronAPI.getUserDataPath();
  // Handle both Windows and Unix paths
  const separator = userDataPath.includes('\\') ? '\\' : '/';
  const snippetPath = `${userDataPath}${separator}snippets${separator}${snippetName}`;
  const result = await window.electronAPI.readFile(snippetPath);
  
  if (result.success) {
    // Extract snippet name without extension - handle all supported extensions
    const langConfig = supportedLanguages[currentLanguage] || supportedLanguages['javascript'];
    const extensions = langConfig.extensions || ['.js', '.ts'];
    const extensionPattern = extensions.map(ext => ext.replace('.', '\\.')).join('|');
    const snippetNameOnly = snippetName.replace(new RegExp(`\\.(${extensionPattern})$`), '');
    
    // Get current tab editor by ID
    const currentEditor = editors.find(e => e.id === currentTabIndex);
    if (currentEditor) {
      // Set snippet name for current tab
      tabSnippets[currentTabIndex] = snippetNameOnly;
      
      // Load content into editor
      currentEditor.editor.setValue(result.content);
      
      // Update tab name if possible
      const tab = document.querySelector(`.tab[data-tab="${currentTabIndex}"]`);
      if (tab) {
        const tabNameSpan = tab.querySelector('.tab-name');
        if (tabNameSpan) {
          tabNameSpan.textContent = snippetName; // Use the full filename with extension
        }
      }
    }
    
    // Update snippet button visibility
    updateSnippetButtonVisibility();
    
    togglePanel('snippets');
  }
};

// Edit snippet - loads it and enables editing
window.editSnippet = async function(snippetName) {
  // Load the snippet (this will set currentSnippetName and show update button)
  const langConfig = supportedLanguages[currentLanguage] || supportedLanguages['javascript'];
  const defaultExt = langConfig.defaultExtension || '.js';
  await window.loadSnippet(`${snippetName}${defaultExt}`);
  // Re-open snippets panel so user can see the update button
  togglePanel('snippets');
};

// Update the currently loaded snippet with current editor content
async function updateCurrentSnippet() {
  const snippetName = tabSnippets[currentTabIndex];
  if (!snippetName) {
    // No snippet currently loaded for this tab, treat as new snippet
    await createNewSnippet();
    return;
  }
  
  // Find editor by ID
  const currentEditor = editors.find(e => e.id === currentTabIndex);
  if (!currentEditor) return;
  
  const code = currentEditor.editor.getValue();
  await window.electronAPI.saveSnippet(snippetName, code, currentLanguage);
  await loadSnippets();
  
  // Keep snippet tracking for this tab
  updateSnippetButtonVisibility();
}

// Clear current snippet when creating new snippet
async function createNewSnippet() {
  try {
    console.log('createNewSnippet called');
    // Find editor by ID
    const currentEditor = editors.find(e => e.id === currentTabIndex);
    if (!currentEditor) {
      console.error('No editor found for current tab:', currentTabIndex);
      return;
    }
    
    const code = currentEditor.editor.getValue();
    console.log('Getting snippet name from modal...');
    const name = await showInputModal('Enter snippet name:', 'Enter snippet name');
    console.log('Snippet name received:', name);
    
    if (!name || !name.trim()) {
      console.log('No snippet name provided, cancelling');
      return;
    }
    
    console.log('Saving snippet:', name, 'for language:', currentLanguage);
    await window.electronAPI.saveSnippet(name.trim(), code, currentLanguage);
    console.log('Snippet saved successfully');
    
    // Set snippet name for current tab
    tabSnippets[currentTabIndex] = name.trim();
    
    // Update tab name
    const tab = document.querySelector(`.tab[data-tab="${currentTabIndex}"]`);
    if (tab) {
      const tabNameSpan = tab.querySelector('.tab-name');
      if (tabNameSpan) {
        const langConfig = supportedLanguages[currentLanguage] || supportedLanguages['javascript'];
        const defaultExt = langConfig.defaultExtension || '.js';
        tabNameSpan.textContent = `${name.trim()}${defaultExt}`;
      }
    }
    
    await loadSnippets();
    
    // Show update button for newly created snippet
    updateSnippetButtonVisibility();
    console.log('Snippet creation completed');
  } catch (error) {
    console.error('Error creating snippet:', error);
    const outputContent = document.getElementById('output-content');
    if (outputContent) {
      outputContent.innerHTML = `<div class="error">Error saving snippet: ${error.message}</div>`;
    }
  }
}

window.deleteSnippet = async function(snippetName) {
  if (await showConfirm(`Delete snippet "${snippetName}"?`)) {
    await window.electronAPI.deleteSnippet(snippetName, currentLanguage);
    await loadSnippets();
  }
};

function initializeSettingsUI() {
  const content = document.getElementById('settings-content');
  
  // General settings
  let html = '<div class="setting-section"><h4>General</h4>';
  const generalSettings = [
    { key: 'autoRun', label: 'Auto-Run' },
    { key: 'lineWrap', label: 'Line Wrap' },
    { key: 'vimKeys', label: 'Vim Keys' },
    { key: 'closeBrackets', label: 'Close Brackets' },
    { key: 'matchLines', label: 'Match Lines' },
    { key: 'scrolling', label: 'Scrolling' },
    { key: 'confirmClose', label: 'Confirm Close' },
    { key: 'autocomplete', label: 'Autocomplete' },
    { key: 'linting', label: 'Linting' },
    { key: 'hoverInfo', label: 'Hover Info' },
    { key: 'signatures', label: 'Signatures' }
  ];
  
  generalSettings.forEach(setting => {
    html += `
      <div class="setting-item">
        <span class="setting-label">${setting.label}</span>
        <div class="setting-control">
          <label class="toggle-switch">
            <input type="checkbox" data-setting="general.${setting.key}" ${settings.general?.[setting.key] ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  // Build settings
  html += '<div class="setting-section"><h4>Build</h4>';
  const buildSettings = [
    { key: 'typescript', label: 'TypeScript' },
    { key: 'jsx', label: 'JSX' },
    { key: 'optionalChaining', label: 'Optional Chaining' },
    { key: 'regexpModifiers', label: 'RegExp Modifiers' },
    { key: 'doExpressions', label: 'Do Expressions' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'recordTuples', label: 'Record & Tuples' },
    { key: 'throwExpressions', label: 'Throw Expressions' },
    { key: 'asyncGenerators', label: 'Async Generators' }
  ];
  
  buildSettings.forEach(setting => {
    html += `
      <div class="setting-item">
        <span class="setting-label">${setting.label}</span>
        <div class="setting-control">
          <label class="toggle-switch">
            <input type="checkbox" data-setting="build.${setting.key}" ${settings.build?.[setting.key] ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  // Advanced settings
  html += '<div class="setting-section"><h4>Advanced</h4>';
  const advancedSettings = [
    { key: 'expressionResults', label: 'Expression Results' },
    { key: 'showUndefined', label: 'Show Undefined' },
    { key: 'loopProtection', label: 'Loop Protection' }
  ];
  
  advancedSettings.forEach(setting => {
    html += `
      <div class="setting-item">
        <span class="setting-label">${setting.label}</span>
        <div class="setting-control">
          <label class="toggle-switch">
            <input type="checkbox" data-setting="advanced.${setting.key}" ${settings.advanced?.[setting.key] ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  content.innerHTML = html;
  
  // Add event listeners to settings
  content.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', async (e) => {
      const [section, key] = e.target.dataset.setting.split('.');
      if (!settings[section]) settings[section] = {};
      settings[section][key] = e.target.checked;
      await window.electronAPI.saveSettings(settings);
      applySettings();
    });
  });
}

function applySettings() {
  editors.forEach(editorData => {
    const editor = editorData.editor;
    
    // Update editor options based on settings
    editor.updateOptions({
      wordWrap: settings.general?.lineWrap ? 'on' : 'off',
      autoClosingBrackets: settings.general?.closeBrackets ? 'always' : 'never',
      matchBrackets: settings.general?.matchLines ? 'always' : 'never',
      quickSuggestions: settings.general?.autocomplete ? {
        other: true,
        comments: false,
        strings: false
      } : false,
      suggestOnTriggerCharacters: settings.general?.autocomplete || false,
      hover: { enabled: settings.general?.hoverInfo || false },
      parameterHints: { enabled: settings.general?.signatures || false }
    });
  });
}


let executeTimeout = null;
function debounceExecute(delay) {
  if (executeTimeout) {
    clearTimeout(executeTimeout);
  }
  executeTimeout = setTimeout(() => {
    executeCode();
  }, delay);
}

async function installPackage() {
  const packageName = await showInputModal('Install Package', 'Enter package name to install');
  if (!packageName) return;
  
  const outputContent = document.getElementById('output-content');
  if (!outputPanelVisible) toggleOutputPanel();
  
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'log';
  loadingDiv.textContent = `Installing ${packageName}...`;
  outputContent.appendChild(loadingDiv);
  
  const result = await window.electronAPI.installPackage(packageName, currentLanguage);
  
  if (result.success) {
    loadingDiv.className = 'success';
    loadingDiv.textContent = `✓ Successfully installed ${packageName}`;
    await loadInstalledPackages();
  } else {
    loadingDiv.className = 'error';
    loadingDiv.textContent = `✗ Failed to install ${packageName}: ${result.error}`;
  }
}

async function loadInstalledPackages() {
  const packages = await window.electronAPI.listInstalledPackages(currentLanguage);
  const list = document.getElementById('installed-packages-list');
  
  if (packages.length === 0) {
    list.innerHTML = '<div style="color: #888; font-size: 12px; margin-top: 8px;">No packages installed</div>';
    return;
  }
  
  const langConfig = supportedLanguages[currentLanguage] || supportedLanguages['javascript'];
  const packageManager = langConfig.packageManager || 'npm';
  const canUninstall = packageManager === 'composer';
  
  list.innerHTML = packages.map(pkg => `
    <div style="padding: 8px; background: #2d2d30; border-radius: 4px; margin-top: 8px; font-size: 13px; color: #cccccc; display: flex; justify-content: space-between; align-items: center;">
      <span>${pkg}</span>
      ${canUninstall ? `<button class="uninstall-package-btn" data-package="${pkg}" style="background: #c53929; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">Remove</button>` : ''}
    </div>
  `).join('');
  
  // Add event listeners for uninstall buttons (Composer only)
  if (canUninstall) {
    list.querySelectorAll('.uninstall-package-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const packageName = btn.getAttribute('data-package');
        if (await showConfirm(`Are you sure you want to uninstall ${packageName}?`)) {
          await uninstallPackage(packageName);
        }
      });
    });
  }
}

async function uninstallPackage(packageName) {
  const outputContent = document.getElementById('output-content');
  if (!outputPanelVisible) toggleOutputPanel();
  
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'log';
  loadingDiv.textContent = `Uninstalling ${packageName}...`;
  outputContent.appendChild(loadingDiv);
  
  const result = await window.electronAPI.uninstallPackage(packageName, currentLanguage);
  
  if (result.success) {
    loadingDiv.className = 'success';
    loadingDiv.textContent = `✓ Successfully uninstalled ${packageName}`;
    await loadInstalledPackages();
  } else {
    loadingDiv.className = 'error';
    loadingDiv.textContent = `✗ Failed to uninstall ${packageName}: ${result.error}`;
  }
}
