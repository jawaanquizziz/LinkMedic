const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'test-fixture', 'test_verification.php');
const content = fs.readFileSync(filePath, 'utf8');

// The Regex from extension.ts (HTML/PHP version)
const htmlRegex = /(?:src|href|include|require|include_once|require_once)\s*=?\s*\(?\s*["']([^"']+)["']/g;

console.log(`Scanning ${filePath}...`);

let match;
while ((match = htmlRegex.exec(content))) {
    let captured = match[1];
    console.log(`[Found Link]: '${captured}'`);

    // --- LOGIC FROM EXTENSION.TS ---
    let normalizedPath = captured;

    // 1. Check Interpolation
    if (normalizedPath.includes('${') || normalizedPath.includes('{$')) {
        console.log(`  -> ACTION: IGNORE (Interpolation detected) - PASS`);
        continue;
    }

    // 2. Strip Query Params
    if (normalizedPath.includes('?')) {
        const stripped = normalizedPath.split('?')[0];
        console.log(`  -> ACTION: STRIP Query Param. New path: '${stripped}'`);
        normalizedPath = stripped;
    } else {
        console.log(`  -> ACTION: CHECK '${normalizedPath}' normally`);
    }
}
