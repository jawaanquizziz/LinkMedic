const triggerRegex = /(?:src|href|import|from|include|require|include_once|require_once)\s*\(?=?\s*["']([^"']*)$/;

const lines = [
    '    <script src="',
    '<img src="./img.png"',
    'import Button from "',
    'import Button from "@/',
    '    <link href="../css/',
    'require("',
    '<a href="#top">',
    '<img data-src="lazy.png">' // Should this match? currently yes.
];

console.log("Testing Trigger Regex:");
lines.forEach(line => {
    const match = line.match(triggerRegex);
    if (match) {
        console.log(`PASS: '${line}' -> Captured: '${match[1]}'`);
    } else {
        console.log(`FAIL: '${line}'`);
    }
});
