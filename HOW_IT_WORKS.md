# How LinkMedic Works 🩺

**LinkMedic** is a VS Code extension designed to automatically find and fix broken file paths in your web projects. Use this guide to understand the magic behind the scenes or to explain it to others.

---

## 🏗️ Architecture: How It Was Built

LinkMedic is built using the **Visual Studio Code Extension API**. It acts as a bridge between your code editor and your file system.

### Core Components
1.  **Diagnostic Collection**: This is the "Reporter" that creates the red squiggly lines you see under broken links.
2.  **FileSystem Watcher**: This is the "Guard" that watches for any changes you make to your files (typing, saving, creating new files) to trigger a re-scan.
3.  **Code Actions Provider**: This provides the "Quick Fix" lightbulb menu to fix issues (like creating a missing file).

---

## 🧠 The "Perfect" Logic: How It Finds Errors

LinkMedic follows a strict but intelligent 4-step process to validate every link in your project:

### 1. **Scanning (Regex Parsing)**
First, it reads your code and looks for patterns that resemble file paths.
-   **HTML/PHP**: It looks for attributes like `src="..."`, `href="..."`, or PHP commands like `include('...')`.
-   **JavaScript/React**: It looks for `import ... from '...'` or `require('...')`.

### 2. **Intelligent Filtering** (The Smart Part!) 🌟
Before checking if a file exists, LinkMedic cleans up the path to avoid false alarms:
-   **Ignores "Dynamic" Paths**: If you write `src="image-${id}.png"`, LinkMedic knows this is a variable and ignores it.
-   **Strips Query Parameters**: If you link to `profile.php?id=123`, LinkMedic intelligently strips the `?id=123` and only checks for `profile.php`.
-   **Ignores External Links**: It automatically ignores `http://`, `mailto:`, and `data:` links since they aren't local files.

### 3. **Path Resolution** (Finding the File)
Once it has a clean path, it tries to find the file on your computer. It handles complex scenarios:
-   **Relative Paths**: `../images/logo.png` (Go up one folder, then into images)
-   **Absolute Paths**: `/assets/style.css` (Start from the project root)
-   **Aliases**: `@/components/Button` (It reads your `tsconfig.json` or `jsconfig.json` to know that `@` actually means `src/`)

### 4. **The "Fuzzy" Safety Net** 🛡️
If LinkMedic **cannot** find the file exactly where you pointed, it doesn't give up immediately.
-   It performs a **"Fuzzy Search"** for the filename in your workspace.
-   If it finds the file somewhere else, it assumes you might have just made a typo in the path and silences the critical error (or warns you), preventing annoying false positives.

---

## 🎯 Who Is This For?

LinkMedic is perfect for:
1.  **Full Stack Developers**: Working with **MERN Stack** (MongoDB, Express, React, Node) who use complex path aliases.
2.  **PHP Developers**: Managing legacy projects with many `include` or `require` statements.
3.  **Static Site Builders**: Writing raw HTML/CSS who want to ensure every image and link works before deploying.
4.  **Teams**: It works perfectly with **Live Share**, so you can debug broken links together with your team in real-time.

---

*This document was generated to help you understand and explain the internal mechanics of the LinkMedic extension.*
