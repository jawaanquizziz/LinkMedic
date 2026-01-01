# LinkMedic 🩺

**LinkMedic** is your essential tool for finding and fixing broken paths in real-time. It ensures your projects are free of missing files and dead links, supporting everything from HTML to complex React/MERN stack applications.

## 🚀 Validated by [JawaanSanth](https://github.com/jawaanquizziz)

---

## ✨ Features

### 🧠 **Intelligent Path Autocompletion** (NEW!)
Stop guessing paths! LinkMedic provides a smart dropdown as you type:
- **Folder Navigation**: Type `../` or `./src/` to browse your project folders dynamically.
- **Smart Logic**: Automatically resolves relative paths and aliases to show you *exactly* what files are available.
- **Interactive**: Select a folder to instantly trigger the next level of suggestions.

### 🔗 **MERN Stack & Path Alias Support** (NEW!)
Modern projects use aliases. LinkMedic understands them.
- **Path Aliases**: Full support for imports like `@/components/Button` defined in your `tsconfig.json` or `jsconfig.json`.
- **Smart Resolution**: Automatically parses your configuration to find where `@/` actually points to.

### 👥 **Live Share Compatible** (NEW!)
Pair programming? No problem.
- **Optimized for Collaboration**: Runs seamlessly during Visual Studio Live Share sessions.
- **High Performance**: Parallel file checks ensure no lag, even over a network connection.

### ⚡ **Blazing Fast Performance**
- **Debounced Checking**: We've optimized the engine to wait until you stop typing, saving your CPU and keeping VS Code buttery smooth.
- **Background Processing**: Heavy lifting happens asynchronously so you never get blocked.

---

## 🛠 Core Capabilities
- **Real-time Validation**: Highlights broken `src`, `href`, `import`, and `require` paths with red squiggly lines.
- **Quick Fix**: References a missing file? Click **"Quick Fix"** -> **"Create missing file"** to generate it instantly.
- **Multi-Language**: Works across HTML, PHP, JavaScript, TypeScript, and React (JSX/TSX).
- **Smart Extensions**: Automatically detects `.js`, `.jsx`, `.ts`, `.tsx`, and `/index` files for Node/React imports.

## Supported File Types
- **Standard Web**: `.html`, `.php`
- **Modern Stack**: `.js`, `.jsx`, `.ts`, `.tsx`

## 📦 Installation
Install directly from the Visual Studio Marketplace. No configuration needed—it works out of the box!

---
*Created with ❤️ by [JawaanSanth](https://github.com/jawaanquizziz)*