# fastTinker

A unified rapid prototyping tool that supports multiple programming languages. Currently supports JavaScript/TypeScript and PHP, with architecture designed for easy addition of more languages in the future.

## Features

- **Multi-language Support**: Switch between JavaScript/TypeScript and PHP seamlessly
- **Language-specific Package Management**: 
  - NPM for JavaScript/TypeScript
  - Composer for PHP
- **Language-aware Snippets**: Snippets are organized by language with appropriate file extensions
- **Monaco Editor**: Full-featured code editor with syntax highlighting and IntelliSense
- **Magic Comments**: Inline value inspection using comments (e.g., `// $variable`)
- **Auto-run**: Automatically execute code on changes (configurable)
- **Multiple Tabs**: Work on multiple files simultaneously

## Project Structure

```
fastTinker/
├── src/
│   ├── main.js          # Electron main process with multi-language execution
│   └── preload.js       # Preload script for secure IPC
├── scripts/
│   └── renderer.js      # Renderer process (UI logic with language switching)
├── styles/
│   └── main.css         # Application styles
├── index.html           # Main HTML file with language selector
├── package.json         # Project configuration
└── README.md            # This file
```

## Reference Implementations

The original implementations are preserved in separate folders for reference:
- `/home/sam/Work/MyRunJS` - JavaScript/TypeScript implementation
- `/home/sam/Work/phpTinker` - PHP implementation

## Supported Languages

### JavaScript/TypeScript
- File extensions: `.js`, `.ts`
- Package manager: NPM
- Default runtime: Node.js

### PHP
- File extensions: `.php`
- Package manager: Composer
- Default runtime: PHP CLI

## Usage

1. **Select Language**: Use the dropdown in the tab bar to switch between JavaScript/TypeScript and PHP
2. **Write Code**: Start coding in the editor
3. **Run Code**: Press `Ctrl+Enter` (or `Cmd+Enter` on Mac) or click the Run button
4. **Install Packages**: Go to Settings > Packages section and install packages for the current language
5. **Save Snippets**: Use the Snippets panel to save and load code snippets

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build for distribution
npm run build
```

## Adding New Languages

The architecture is designed to easily add new languages. To add a new language:

1. Update `LANGUAGES` object in `src/main.js` with language configuration
2. Add language-specific execution handler in `src/main.js`
3. Add language option to the selector in `index.html`
4. Update default content in `scripts/renderer.js` `initializeEditor()` function

## License

MIT

