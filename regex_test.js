const mernRegex = /(?:import|from|require)\s*\(?["']([^"']+)["']\)?/g;

const testCases = [
    "import React from 'react'", // Should ignore (node_module)
    "import App from './App'", // Should match ./App
    "import { useState } from 'react'", // Should ignore
    "import './App.css'", // Should match ./App.css
    "const db = require('./config/db')", // Should match ./config/db
    "import Button from '@/components/Button'", // Should match @/components/Button (but logic ignores it?)
    "import { verify } from '../../utils/auth'", // Should match ../../utils/auth
    "require('dotenv').config()", // Should ignore
];

console.log("Testing Regex Matches:");
testCases.forEach(text => {
    // Reset regex lastIndex
    mernRegex.lastIndex = 0;
    let match;
    while ((match = mernRegex.exec(text))) {
        const linkPath = match[1];
        let status = "MATCHED";

        // Simulating the logic in extension.ts
        if (linkPath.startsWith('http') || linkPath.startsWith('//') || linkPath.startsWith('mailto:') || linkPath.startsWith('data:')) status = "IGNORED (Protocol)";
        else if (!linkPath.startsWith('.') && !linkPath.startsWith('/')) status = "IGNORED (Non-relative / Module)";

        console.log(`"${text}" -> Found: "${linkPath}" -> Action: ${status}`);
    }
});
